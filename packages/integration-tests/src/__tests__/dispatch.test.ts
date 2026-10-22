import * as cursery from "cursery";

import { load, mount, nix } from "../testing.ts";

/** Evaluates `code` with `io` in scope. */
function evaluate(code: string) {
  return cursery.evaluate(nix`let io = import <web/io>; in ${code}`);
}

/** Loads and mounts an app with `html` and `dispatch` in scope. */
function render(code: string) {
  using resources = new DisposableStack();
  const { path } = resources.use(
    load({
      "default.nix": nix`let
        inherit (import <web/dom>) html;
        inherit (import <web/io>) dispatch;
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

/** The JSON in the `<pre>`. */
function shown(view: { get: (selector: string) => HTMLElement }) {
  return JSON.parse(view.get("pre").textContent!) as unknown;
}

/** Clicks the button, returning what was logged to the console. */
function errors(view: { get: (selector: string) => HTMLElement }) {
  using error = vi.spyOn(console, "error").mockImplementation(() => {});
  view.get("button").click();
  return error.mock.calls.map(([message]) => String(message));
}

describe("dispatch", () => {
  it("returns a derivation", () => {
    expect(
      evaluate(nix`let drv = io.dispatch "increment"; in {
        inherit (drv) type name builder action;
        isFunctor = drv ? __functor;
      }`),
    ).toEqual({
      type: "derivation",
      name: "dispatch",
      builder: "builtin:dispatch",
      action: "increment",
      isFunctor: true,
    });
  });

  it("sets the payload when called", () => {
    expect(
      evaluate(nix`let drv = io.dispatch "add" { text = "milk"; }; in {
        inherit (drv) type action passthru;
        isFunctor = drv ? __functor;
      }`),
    ).toEqual({
      type: "derivation",
      action: "add",
      passthru: { payload: { text: "milk" } },
      isFunctor: false,
    });
  });

  it("hashes the action into the output path, but not the payload", () => {
    expect(
      evaluate(nix`let out = drv: drv.outPath; in {
        same = out (io.dispatch "a") == out (io.dispatch "a");
        type = out (io.dispatch "a") != out (io.dispatch "b");
        payload = out (io.dispatch "a" 1) == out (io.dispatch "a" 2);
        unset = out (io.dispatch "a") == out (io.dispatch "a" null);
      }`),
    ).toEqual({ same: true, type: true, payload: true, unset: true });
  });

  it("keeps the payload as a Nix value", () => {
    expect(
      evaluate(nix`(io.dispatch "call" (x: x + 1)).passthru.payload 1`),
    ).toBe(2);
  });

  it("validates the type", () => {
    expect(() => evaluate(nix`io.dispatch 1`)).toThrow(
      /Invalid action type of type int: expected a string/,
    );
  });

  describe("running", () => {
    it("passes `update` the type and payload", () => {
      using view = render(nix`{
        init = [ ];
        update = state: action: state ++ [ action ];
        render = state: [
          (html.pre (builtins.toJSON state))
          (html.button { id = "bare"; on.click = event: dispatch "bare"; })
          (html.button { id = "full"; on.click = event: dispatch "full" { n = 1; }; })
        ];
      }`);

      view.get("#bare").click();
      view.get("#full").click();

      expect(shown(view)).toEqual([
        { type: "bare" },
        { type: "full", payload: { n: 1 } },
      ]);
    });

    it("renders, then returns the next state when imported", () => {
      using view = render(nix`{
        init = { count = 0; seen = null; };
        update = state: action:
          if action.type == "increment" then state // { count = state.count + 1; }
          else state // { seen = action.payload; };
        render = state: [
          (html.pre (builtins.toJSON state))
          (html.button {
            on.click = event:
              let result = import (dispatch "increment"); in
              # Forced here: forced lazily, in \`update\`, it couldn't dispatch.
              builtins.seq result (dispatch "see" result);
          })
        ];
      }`);

      view.get("button").click();

      expect(shown(view)).toEqual({
        count: 1,
        seen: { count: 1, seen: null },
      });
    });

    it("runs the same dispatch again when imported again", () => {
      using view = render(nix`{
        init = 0;
        update = state: action: state + 1;
        render = state: [
          (html.pre (builtins.toJSON state))
          (html.button {
            on.click = event:
              let
                first = import (dispatch "increment");
                second = import (dispatch "increment");
              in
              if first == 1 && second == 2 then null else throw "not run twice";
          })
        ];
      }`);

      view.get("button").click();

      expect(shown(view)).toBe(2);
    });

    it("keeps earlier dispatches when a handler fails", () => {
      using view = render(nix`{
        init = 0;
        update = state: action: state + 1;
        render = state: [
          (html.pre (builtins.toJSON state))
          (html.button {
            on.click = event:
              let result = import (dispatch "increment"); in
              if result == 1 then throw "later" else null;
          })
        ];
      }`);

      expect(errors(view)).toEqual([expect.stringMatching(/later/)]);
      expect(shown(view)).toBe(1);
    });

    it("can't dispatch while rendering", () => {
      expect(() =>
        render(nix`{ render = state: import (dispatch "render"); }`),
      ).toThrow(/Cannot dispatch outside an event handler/);
    });

    it("can't dispatch from `update`", () => {
      using view = render(nix`{
        init = null;
        update = state: action: import (dispatch "nested");
        render = state: [
          (html.pre (builtins.toJSON state))
          (html.button { on.click = event: dispatch "outer"; })
        ];
      }`);

      expect(errors(view)).toEqual([
        expect.stringMatching(/Cannot dispatch outside an event handler/),
      ]);
      expect(shown(view)).toBe(null);
    });
  });

  describe("errors", () => {
    it("rejects handler results that aren't effects", () => {
      using view = render(nix`{
        render = state: html.button { on.click = event: "action"; };
      }`);

      expect(errors(view)).toEqual([
        expect.stringMatching(
          /Invalid handler result of type string: expected an effect/,
        ),
      ]);
    });

    it("throws errors of returned effects", () => {
      using view = render(nix`{
        render = state: html.button {
          on.click = event: derivation { name = "missing"; builder = "builtin:missing"; };
        };
      }`);

      expect(errors(view)).toEqual([expect.stringMatching(/Unknown builder/)]);
    });

    it("throws errors from the payload", () => {
      using view = render(nix`{
        init = null;
        update = state: action: action.payload;
        render = state: html.button {
          on.click = event: dispatch "bad" (throw "bad payload");
        };
      }`);

      expect(errors(view)).toEqual([expect.stringMatching(/bad payload/)]);
    });
  });
});
