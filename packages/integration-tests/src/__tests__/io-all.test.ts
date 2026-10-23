import * as cursery from "cursery";

import { load, mount, nix } from "../testing.ts";

/** Evaluates `code` with `io` in scope. */
function evaluate(code: string) {
  return cursery.evaluate(nix`let io = import <web/io>; in ${code}`);
}

/**
 * Mounts an app with a button running `handler`, with `io`, `log`
 * (dispatching a `log` action), and `push` (a command pushing its `value`
 * to `globalThis.ran`) in scope. Logged payloads show in a `<pre>`.
 */
function render(handler: string) {
  using resources = new DisposableStack();
  const { path } = resources.use(
    load({
      "default.nix": nix`let
        inherit (import <web/dom>) html;
        io = import <web/io>;
        log = io.dispatch "log";
        push = value: io.runCommand "push" { inherit value; } ''
          $out = (globalThis.ran ??= []).push($value);
        '';
      in {
        init = [ ];
        update = state: action: state ++ [ action.payload ];
        render = state: [
          (html.pre (builtins.toJSON state))
          (html.button { on.click = event: ${handler}; })
        ];
      }`,
    }),
  );
  const { container } = resources.use(mount(path));
  const owned = resources.move();

  return {
    /** Clicks the button, returning the console errors. */
    click: () => {
      using error = vi.spyOn(console, "error").mockImplementation(() => {});
      container.querySelector("button")!.click();
      return error.mock.calls.map(([message]) => String(message));
    },

    /** The payloads logged. */
    logged: () =>
      JSON.parse(container.querySelector("pre")!.textContent!) as unknown,

    [Symbol.dispose]: () => owned.dispose(),
  };
}

declare global {
  /** What `push` commands pushed. */
  var ran: unknown[] | undefined;
}

describe("all", () => {
  afterEach(() => {
    globalThis.ran = undefined;
  });

  it("lists values that aren't effects", () => {
    expect(evaluate(nix`io.all [ 1 "two" ]`)).toEqual([1, "two"]);
  });

  it("lists nothing without effects", () => {
    expect(evaluate(nix`io.all [ ]`)).toEqual([]);
  });

  it("validates the effects", () => {
    expect(() => evaluate(nix`io.all (io.dispatch "a" null)`)).toThrow(
      /Invalid effects of type set: expected a list/,
    );
  });

  describe("running", () => {
    it("runs effects in order", () => {
      using view = render(nix`io.all [ (push 1) (push 2) (push 3) ]`);

      expect(view.click()).toEqual([]);
      expect(globalThis.ran).toEqual([1, 2, 3]);
    });

    it("runs the same effect twice", () => {
      using view = render(nix`let once = push 1; in io.all [ once once ]`);

      view.click();

      expect(globalThis.ran).toEqual([1, 1]);
    });

    it("outputs a list of outputs", () => {
      using view = render(nix`io.map (outputs: log outputs) (io.all [
        (push "a")
        "b"
        (io.map (count: count * 10) (push "c"))
      ])`);

      view.click();

      expect(view.logged()).toEqual([[1, "b", 20]]);
    });

    it("stops at the first failure", () => {
      using view = render(nix`io.all [
        (push 1)
        (io.runCommand "fail" { } "throw new Error('nope')")
        (push 2)
      ]`);

      expect(view.click()).toEqual([expect.stringMatching(/Error: nope/)]);
      expect(globalThis.ran).toEqual([1]);
    });
  });
});
