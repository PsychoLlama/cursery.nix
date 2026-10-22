import * as cursery from "cursery";

import { load, mount, nix } from "../testing.ts";

/** Evaluates `code` with `io` in scope. */
function evaluate(code: string) {
  return cursery.evaluate(nix`let io = import <web/io>; in ${code}`);
}

/**
 * Loads and mounts an app with `html`, `dispatch`, `runCommand`, `log`
 * (dispatching a `log` action), and `logForced` in scope, logging payloads
 * into a `<pre>` around the button `button` renders.
 */
function render(button: string) {
  using resources = new DisposableStack();
  const { path } = resources.use(
    load({
      "default.nix": nix`let
        inherit (import <web/dom>) html;
        inherit (import <web/io>) dispatch runCommand;
        log = dispatch "log";

        # Imports run when forced, so this forces \`value\` before \`update\`.
        logForced = value: if builtins.toJSON value != "" then log value else null;
      in {
        init = [ ];
        update = state: action: state ++ [ action.payload ];
        render = state: [ (html.pre (builtins.toJSON state)) (${button}) ];
      }`,
    }),
  );
  const { container } = resources.use(mount(path));
  const owned = resources.move();

  return {
    /** Clicks the button. */
    click: () => container.querySelector("button")!.click(),

    /** The payloads logged. */
    logged: () =>
      JSON.parse(container.querySelector("pre")!.textContent!) as unknown,

    [Symbol.dispose]: () => owned.dispose(),
  };
}

/** Clicks a button running `handler`, returning the payloads it logged. */
function logs(handler: string) {
  using view = render(nix`html.button { on.click = event: ${handler}; }`);
  view.click();
  return view.logged();
}

/** Clicks a button running `handler`, returning the console errors. */
function errors(handler: string) {
  using error = vi.spyOn(console, "error").mockImplementation(() => {});
  using view = render(nix`html.button { on.click = event: ${handler}; }`);
  view.click();
  return error.mock.calls.map(([message]) => String(message));
}

declare global {
  /** What scripts ran, for scripts to push to. */
  var ran: unknown[] | undefined;
}

describe("runCommand", () => {
  afterEach(() => {
    globalThis.ran = undefined;
  });

  it("returns a derivation", () => {
    expect(
      evaluate(nix`let drv = io.runCommand "hi" { n = 1; } "$out = 1;"; in {
        inherit (drv) type name builder script passthru;
      }`),
    ).toEqual({
      type: "derivation",
      name: "hi",
      builder: "builtin:runCommand",
      script: "$out = 1;",
      passthru: { env: { n: 1 } },
    });
  });

  it("returns `$out` when imported", () => {
    expect(
      logs(nix`logForced (import (runCommand "out" { } ''
        $out = { list: [1, 2.5, "three", true, null] };
      ''))`),
    ).toEqual([{ list: [1, 2.5, "three", true, null] }]);
  });

  it("returns null without `$out`", () => {
    expect(logs(nix`logForced (import (runCommand "none" { } ""))`)).toEqual([
      null,
    ]);
  });

  it("converts `$out` as JSON does", () => {
    expect(
      logs(nix`logForced (import (runCommand "json" { } ''
        $out = { gone: undefined, date: new Date(0), list: [undefined] };
      ''))`),
    ).toEqual([{ date: "1970-01-01T00:00:00.000Z", list: [null] }]);
  });

  it("passes `env` as `$<name>`", () => {
    expect(
      logs(nix`logForced (import (runCommand "env" {
        count = 3;
        attrs = { list = [ "a" ]; };
      } ''
        $out = [$count * 2, $attrs.list[0]];
      ''))`),
    ).toEqual([[6, "a"]]);
  });

  it("runs when returned from a handler", () => {
    using view = render(
      nix`html.button { on.click = event: runCommand "push" { } "(globalThis.ran ??= []).push(1)"; }`,
    );

    view.click();
    view.click();

    expect(globalThis.ran).toEqual([1, 1]);
  });

  it("runs again when imported again", () => {
    expect(
      logs(nix`let
        count = _: import (runCommand "count" { } "$out = (globalThis.ran ??= []).push(1);");
        first = count null;
      in
      # Forces \`first\` before describing the same command again.
      if first == 1 then logForced [ first (count first) ] else null`),
    ).toEqual([[1, 2]]);
  });

  it("throws catchably when the script throws", () => {
    expect(
      logs(
        nix`logForced (builtins.tryEval (import (runCommand "fail" { } "throw new Error('nope')"))).success`,
      ),
    ).toEqual([false]);
  });

  describe("errors", () => {
    it("reports thrown errors", () => {
      expect(
        errors(nix`import (runCommand "fail" { } "throw new Error('nope')")`),
      ).toEqual([expect.stringMatching(/Error: nope/)]);
    });

    it("reports syntax errors", () => {
      expect(errors(nix`import (runCommand "bad" { } "$out = ;")`)).toEqual([
        expect.stringMatching(/SyntaxError/),
      ]);
    });

    it("rejects promises", () => {
      expect(
        errors(
          nix`import (runCommand "async" { } "$out = Promise.resolve(1);")`,
        ),
      ).toEqual([expect.stringMatching(/can't be a promise/)]);
    });

    it("rejects env names that aren't identifiers", () => {
      expect(errors(nix`import (runCommand "env" { "a-b" = 1; } "")`)).toEqual([
        expect.stringMatching(/Invalid env \\"a-b\\"/),
      ]);
      expect(errors(nix`import (runCommand "env" { out = 1; } "")`)).toEqual([
        expect.stringMatching(/other than `out`/),
      ]);
    });

    it("rejects env that isn't an attrset", () => {
      expect(errors(nix`runCommand "env" [ ] ""`)).toEqual([
        expect.stringMatching(/Invalid env of type list/),
      ]);
    });

    it("refuses to run while rendering", () => {
      using resources = new DisposableStack();
      const { path } = resources.use(
        load({
          "default.nix": nix`let inherit (import <web/io>) runCommand; in {
            render = state: import (runCommand "render" { } "$out = 1;");
          }`,
        }),
      );

      expect(() => resources.use(mount(path))).toThrow(
        /Cannot runCommand outside an event handler/,
      );
    });
  });
});
