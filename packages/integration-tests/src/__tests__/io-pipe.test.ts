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

describe("pipe", () => {
  afterEach(() => {
    globalThis.ran = undefined;
  });

  it("threads values through the functions", () => {
    expect(evaluate(nix`io.pipe 1 [ (n: n + 1) (n: n * 2) ]`)).toBe(4);
  });

  it("returns the value without functions", () => {
    expect(evaluate(nix`io.pipe 1 [ ]`)).toBe(1);
  });

  it("returns a chain once a function returns an effect", () => {
    expect(
      evaluate(nix`(io.pipe 1 [ (n: io.dispatch "a" n) (state: null) ])._type`),
    ).toBe("io");
  });

  it("validates the functions", () => {
    expect(() => evaluate(nix`io.pipe 1 (n: n)`)).toThrow(
      /Invalid functions of type lambda: expected a list/,
    );
    expect(() => evaluate(nix`io.pipe 1 [ 2 ]`)).toThrow(
      /Invalid function of type int/,
    );
  });

  describe("running", () => {
    it("passes outputs on", () => {
      using view = render(nix`io.pipe 5 [
        (n: io.runCommand "double" { inherit n; } "$out = $n * 2;")
        (n: n + 1)
        (n: log n)
      ]`);

      expect(view.click()).toEqual([]);
      expect(view.logged()).toEqual([11]);
    });

    it("runs effects in order", () => {
      using view = render(nix`io.pipe null [
        (_: push 1)
        (_: push 2)
        (_: push 3)
      ]`);

      view.click();

      expect(globalThis.ran).toEqual([1, 2, 3]);
    });

    it("passes on failures", () => {
      using view = render(nix`io.pipe null [
        (_: io.runCommand "fail" { } "throw new Error('nope')")
        (output: push 1)
        (_: log "after")
      ]`);

      expect(view.click()).toEqual([
        'Unhandled failure: Command "fail" failed: Error: nope',
      ]);
      expect(globalThis.ran).toEqual([1]);
      expect(view.logged()).toEqual(["after"]);
    });
  });
});
