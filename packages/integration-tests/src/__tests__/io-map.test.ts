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

describe("map", () => {
  afterEach(() => {
    globalThis.ran = undefined;
  });

  it("describes the chain", () => {
    expect(
      evaluate(nix`let chain = io.map (out: null) (io.dispatch "a"); in {
        inherit (chain) _type;
        source = chain.source.inputs.type;
        next = builtins.isFunction chain.next;
      }`),
    ).toEqual({ _type: "io", source: "a", next: true });
  });

  it("validates the function", () => {
    expect(() => evaluate(nix`io.map 1 (io.dispatch "a")`)).toThrow(
      /Invalid function of type int/,
    );
  });

  it("validates the source", () => {
    expect(() => evaluate(nix`io.map (out: null) 1`)).toThrow(
      /Invalid source of type int: expected an effect/,
    );
  });

  describe("running", () => {
    it("passes the output to the function", () => {
      using view = render(
        nix`io.map (out: log out) (io.runCommand "ten" { } "$out = 10;")`,
      );

      expect(view.click()).toEqual([]);
      expect(view.logged()).toEqual([10]);
    });

    it("passes on the state from a dispatch", () => {
      using view = render(nix`io.map (state: log state) (log "first")`);

      view.click();

      expect(view.logged()).toEqual(["first", ["first"]]);
    });

    it("runs effects in order", () => {
      using view = render(nix`io.map
        (_: io.map (_: push 3) (push 2))
        (push 1)`);

      view.click();

      expect(globalThis.ran).toEqual([1, 2, 3]);
    });

    it("runs a chain as the source", () => {
      using view = render(nix`io.map
        (count: log count)
        (io.map (_: push "b") (push "a"))`);

      view.click();

      expect(globalThis.ran).toEqual(["a", "b"]);
      expect(view.logged()).toEqual([2]);
    });

    it("runs the same effect twice", () => {
      using view = render(nix`let once = push 1; in io.map (_: once) once`);

      view.click();

      expect(globalThis.ran).toEqual([1, 1]);
    });

    it("ends the chain at other values, forcing them", () => {
      using view = render(nix`io.map (_: { done = throw "forced"; }) (push 1)`);

      expect(view.click()).toEqual([expect.stringMatching(/forced/)]);
      expect(globalThis.ran).toEqual([1]);
    });

    it("carries on past failures the function ignores, reporting them", () => {
      using view = render(nix`io.map
        (_: push 1)
        (io.runCommand "fail" { } "throw new Error('nope')")`);

      expect(view.click()).toEqual([
        'Unhandled failure: Command "fail" failed: Error: nope',
      ]);
      expect(globalThis.ran).toEqual([1]);
    });

    it("doesn't report failures functions return, until forced", () => {
      using view = render(nix`io.map
        (output: log (builtins.tryEval output).success)
        (io.map (output: output) (io.runCommand "fail" { } "throw new Error('nope')"))`);

      expect(view.click()).toEqual([]);
      expect(view.logged()).toEqual([false]);
    });

    it("passes on failures, throwing when forced", () => {
      using view = render(nix`io.map
        (output: log (builtins.tryEval output).success)
        (io.runCommand "fail" { } "throw new Error('nope')")`);

      expect(view.click()).toEqual([]);
      expect(view.logged()).toEqual([false]);
    });

    it("passes on failed functions", () => {
      using view = render(nix`io.map
        (output: log (builtins.tryEval output).success)
        (io.map (_: throw "broken") (push 1))`);

      expect(view.click()).toEqual([]);
      expect(view.logged()).toEqual([false]);
    });

    it("reports failures the chain ends with", () => {
      using view = render(nix`io.map
        (output: output)
        (io.runCommand "fail" { } "throw new Error('nope')")`);

      expect(view.click()).toEqual([expect.stringMatching(/Error: nope/)]);
    });

    it("reports failures passed on as thrown, without nesting", () => {
      using view = render(nix`io.map
        (output: output)
        (io.map (output: output) (io.runCommand "fail" { } "throw new Error('nope')"))`);

      const [error, ...rest] = view.click();
      expect(rest).toEqual([]);
      expect(error).toMatch(
        /error thrown: "Command \\"fail\\" failed: Error: nope"/,
      );
      expect(error).not.toMatch(/error thrown[^]*error thrown/);
    });

    it("reports failures that effects force", () => {
      using view = render(nix`io.map
        (output: log output)
        (io.runCommand "fail" { } "throw new Error('nope')")`);

      expect(view.click()).toEqual([expect.stringMatching(/Error: nope/)]);
      expect(view.logged()).toEqual([]);
    });

    it("reports functions that fail", () => {
      using view = render(nix`io.map (_: throw "broken") (push 1)`);

      expect(view.click()).toEqual([expect.stringMatching(/broken/)]);
    });
  });
});
