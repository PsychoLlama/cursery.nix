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
      inherit (import <web/io>) dispatch;
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

/** Clicks `element`, returning whether the default was prevented. */
function click(element: HTMLElement) {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true });
  element.dispatchEvent(event);
  return event.defaultPrevented;
}

describe("derivations", () => {
  it("runs a derivation when imported", () => {
    using view = render(
      logger(nix`html.button {
        on.click = event: log (import (event.preventDefault { }));
      }`),
    );

    expect(click(view.get("button"))).toBe(true);
    expect(logged(view)).toEqual([{ type: "success", value: null }]);
  });

  it("only describes the effect until imported", () => {
    using view = render(
      logger(nix`html.button {
        on.click = event: log (event.preventDefault { }).type;
      }`),
    );

    expect(click(view.get("button"))).toBe(false);
    expect(logged(view)).toEqual(["derivation"]);
  });

  it("hides the event's `__id`", () => {
    using view = render(
      logger(nix`html.button { on.click = event: log (event ? __id); }`),
    );

    view.get("button").click();

    expect(logged(view)).toEqual([false]);
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
            built = import (event.preventDefault { });
          in
          if before >= 0 && built.type == "success" then
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
        on.click = event: log (event.preventDefault { }).outPath;
      }`),
    );

    view.get("button").click();
    view.get("button").click();

    const [first, second] = logged(view) as string[];
    expect(first).not.toBe(second);
  });

  it("reports unknown builders", () => {
    using view = render(
      logger(nix`html.button {
        on.click = event: log (import (derivation {
          name = "missing";
          builder = "builtin:missing";
        }));
      }`),
    );

    view.get("button").click();

    expect(logged(view)).toEqual([
      { type: "error", error: 'Unknown builder "builtin:missing"' },
    ]);
  });

  it("fails builders on events that finished dispatching", () => {
    using view = render(nix`{
      init = { effect = null; result = null; };
      update = state: action: state // action.payload;
      render = state: [
        (html.pre (builtins.toJSON state.result))
        (html.button {
          id = "keep";
          on.click = event: dispatch "set" { effect = event.preventDefault { }; };
        })
        (html.button {
          id = "run";
          on.click = event: dispatch "set" { result = import state.effect; };
        })
      ];
    }`);

    view.get("#keep").click();

    expect(click(view.get("#run"))).toBe(false);
    expect(logged(view)).toEqual({
      type: "error",
      error: expect.stringMatching(
        /^Cannot preventDefault: event \d+ finished dispatching$/,
      ),
    });
  });

  it("reports missing events", () => {
    using view = render(
      logger(nix`html.button {
        on.click = event: log (map (attrs: import (derivation ({
          name = "preventDefault";
          builder = "builtin:preventDefault";
        } // attrs))) [ { } { event = "nope"; } { event = 1000000; } ]);
      }`),
    );

    expect(click(view.get("button"))).toBe(false);
    expect(logged(view)).toEqual([
      [
        {
          type: "error",
          error:
            "Cannot preventDefault without an event: set `event` to the event's `__id`",
        },
        {
          type: "error",
          error:
            'Cannot preventDefault: `event` is "nope", which is not an event\'s `__id`',
        },
        {
          type: "error",
          error: expect.stringMatching(/which is not an event's `__id`$/),
        },
      ],
    ]);
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
