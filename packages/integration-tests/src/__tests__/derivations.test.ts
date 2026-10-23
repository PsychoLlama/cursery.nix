import { load, mount, nix } from "../testing.ts";

/**
 * Loads and mounts an app with the DOM builders, `dispatch`, and `log`
 * (dispatching a `log` action) in scope.
 */
function render(code: string) {
  using resources = new DisposableStack();
  const { path } = resources.use(
    load({
      "default.nix": nix`let
      inherit (import <web/dom>) html;
      inherit (import <web/io>) dispatch runCommand;
      log = dispatch "log";
    in ${code}`,
    }),
  );
  const { container } = resources.use(mount(path));
  const owned = resources.move();

  return {
    /** The first element matching `selector`. */
    get: (selector: string) => container.querySelector<HTMLElement>(selector)!,
    [Symbol.dispose]: () => owned.dispose(),
  };
}

/** Logs payloads, rendering the log as JSON in a `<pre>`, around `view`. */
const logger = (view: string) => nix`{
  init = [ ];
  update = state: action: state ++ [ action.payload ];
  render = state: [ (html.pre (builtins.toJSON state)) (${view}) ];
}`;

/** The actions `logger` logged. */
function logged(view: { get: (selector: string) => HTMLElement }) {
  return JSON.parse(view.get("pre").textContent!) as unknown;
}

declare global {
  /** What commands pushed. */
  var ran: unknown[] | undefined;
}

describe("derivations", () => {
  afterEach(() => {
    globalThis.ran = undefined;
  });

  it("runs a derivation when imported", () => {
    using view = render(
      logger(nix`html.button {
        on.click = event: log (import (runCommand "one" { } "$out = 1;"));
      }`),
    );

    view.get("button").click();

    expect(logged(view)).toEqual([1]);
  });

  it("only describes the effect until imported", () => {
    using view = render(
      logger(nix`html.button {
        on.click = event: log (runCommand "ran" { } "globalThis.ran = [ ];").type;
      }`),
    );

    view.get("button").click();

    expect(globalThis.ran).toBeUndefined();
    expect(logged(view)).toEqual(["derivation"]);
  });

  it("returns the attributes as a derivation", () => {
    using view = render(
      logger(nix`html.button {
        on.click = event:
          let
            drv = derivation { name = "example"; builder = "none"; type = "other"; };
          in
          log { inherit (drv) name builder type; };
      }`),
    );

    view.get("button").click();

    expect(logged(view)).toEqual([
      { name: "example", builder: "none", type: "derivation" },
    ]);
  });

  it("hashes attributes into the output path", () => {
    using view = render(
      logger(nix`html.button {
        on.click = event:
          let
            output = attrs: (derivation ({ name = "example"; builder = "none"; } // attrs)).outPath;
          in
          log {
            path = output { };
            same = output { } == output { };
            attrs = output { } != output { extra = 1; };
            builder = output { } != output { builder = "other"; };
          };
      }`),
    );

    view.get("button").click();

    expect(logged(view)).toEqual([
      {
        path: expect.stringMatching(/^\/nix\/store\/[0-9a-z]{32}-example$/),
        same: true,
        attrs: true,
        builder: true,
      },
    ]);
  });

  it("keeps `passthru` out of the hash", () => {
    using view = render(
      logger(nix`html.button {
        on.click = event:
          let
            drv = passthru: derivation { name = "example"; builder = "none"; inherit passthru; };
          in
          log {
            same = (drv 1).outPath == (drv 2).outPath;
            # Functions can't be coerced, so this would throw if hashed.
            value = (drv { f = x: x * 2; }).passthru.f 3;
          };
      }`),
    );

    view.get("button").click();

    expect(logged(view)).toEqual([{ same: true, value: 6 }]);
  });

  it("advances the generation with each evaluation", () => {
    using view = render(
      logger(
        nix`html.button { on.click = event: log (builtins.__currentGeneration event); }`,
      ),
    );

    view.get("button").click();
    view.get("button").click();

    const [first, second] = logged(view) as number[];
    expect(second).toBeGreaterThan(first!);
  });

  it("advances the generation after each build", () => {
    using view = render(
      logger(nix`html.button {
        on.click = event:
          let
            before = builtins.__currentGeneration event;
            built = import (runCommand "none" { } "");
          in
          if before >= 0 && built == null then
            log (builtins.__currentGeneration built > before)
          else
            null;
      }`),
    );

    view.get("button").click();

    expect(logged(view)).toEqual([true]);
  });

  it("gives each event its own outputs", () => {
    using view = render(
      logger(nix`html.button {
        on.click = event: log (runCommand "none" { } "").outPath;
      }`),
    );

    view.get("button").click();
    view.get("button").click();

    const [first, second] = logged(view) as string[];
    expect(first).not.toBe(second);
  });

  it("throws catchably when a build fails", () => {
    using view = render(
      logger(nix`html.button {
        on.click = event: log (builtins.tryEval (import (derivation {
          name = "missing";
          builder = "builtin:missing";
        }))).success;
      }`),
    );

    view.get("button").click();

    expect(logged(view)).toEqual([false]);
  });

  describe("errors", () => {
    /** Clicks the button, returning what was logged to the console. */
    function errors(code: string) {
      using error = vi.spyOn(console, "error").mockImplementation(() => {});
      using view = render(
        logger(nix`html.button { on.click = event: ${code}; }`),
      );
      view.get("button").click();
      return error.mock.calls.map(([message]) => String(message));
    }

    it("reports unknown builders", () => {
      expect(
        errors(
          nix`import (derivation { name = "missing"; builder = "builtin:missing"; })`,
        ),
      ).toEqual([expect.stringMatching(/Unknown builder/)]);
    });

    it("validates names", () => {
      expect(
        errors(nix`derivation { name = "a/b"; builder = "none"; }`),
      ).toEqual([expect.stringMatching(/Invalid derivation name "a\/b"/)]);
    });

    it("requires a builder", () => {
      expect(errors(nix`derivation { name = "example"; }`)).toEqual([
        expect.stringMatching(/builder/),
      ]);
    });

    it("rejects attributes that aren't strings", () => {
      expect(
        errors(nix`derivation { name = "example"; builder = drv: null; }`),
      ).toEqual([
        expect.stringMatching(/cannot \(strongly\) coerce lambda to a string/),
      ]);
    });
  });
});
