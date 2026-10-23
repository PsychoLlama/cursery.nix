import * as cursery from "cursery";

import { load, mount, nix } from "../testing.ts";

/** Evaluates `code` with `io` in scope. */
function evaluate(code: string) {
  return cursery.evaluate(nix`let io = import <web/io>; in ${code}`);
}

/** Effects for `io.call`. */
const effects = {
  /** Pushes `value` to `globalThis.ran`, returning the new length. */
  push: (value: unknown) => (globalThis.ran ??= []).push(value),
  fail: () => {
    throw new Error("nope");
  },
  ten: () => 10,
  double: (n: number) => n * 2,
};

/**
 * Mounts an app with a button running `handler`, with `io`, `log`
 * (dispatching a `log` action), and `push` (an effect pushing its input to
 * `globalThis.ran`) in scope. Logged payloads show in a `<pre>`.
 */
function render(handler: string) {
  using resources = new DisposableStack();
  const { path } = resources.use(
    load({
      "default.nix": nix`let
        inherit (import <web/dom>) html;
        io = import <web/io>;
        log = io.dispatch "log";
        push = io.call "push";
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
  const { container } = resources.use(mount(path, { effects }));
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
  /** What `push` pushed. */
  var ran: unknown[] | undefined;
}

/** A command that fails. */
const fail = nix`(io.call "fail" null)`;

describe("catch", () => {
  afterEach(() => {
    globalThis.ran = undefined;
  });

  it("describes the chain", () => {
    expect(
      evaluate(nix`let chain = io.catch (error: null) (io.dispatch "a" null); in {
        inherit (chain) _type;
        source = chain.source.inputs.type;
        catch = builtins.isFunction chain.catch;
      }`),
    ).toEqual({ _type: "io", source: "a", catch: true });
  });

  it("validates the handler", () => {
    expect(() => evaluate(nix`io.catch 1`)).toThrow(
      /Invalid handler of type int: expected a function of the error/,
    );
  });

  it("validates the source", () => {
    expect(() => evaluate(nix`io.catch (error: null) 1`)).toThrow(
      /Invalid source of type int: expected an effect/,
    );
  });

  describe("running", () => {
    it("passes failures to the handler", () => {
      using view = render(nix`io.catch (error: log error) ${fail}`);

      expect(view.click()).toEqual([]);
      expect(view.logged()).toEqual([
        { message: 'Effect "fail" failed: Error: nope' },
      ]);
    });

    it("passes successes through", () => {
      using view =
        render(nix`io.map (out: log out) (io.catch (error: log "caught")
        (io.call "ten" null))`);

      view.click();

      expect(view.logged()).toEqual([10]);
    });

    it("carries on from the handler's value", () => {
      using view = render(
        nix`io.map (out: log out) (io.catch (error: 0) ${fail})`,
      );

      view.click();

      expect(view.logged()).toEqual([0]);
    });

    it("runs effects the handler returns", () => {
      using view = render(nix`io.catch (error: push 1) ${fail}`);

      view.click();

      expect(globalThis.ran).toEqual([1]);
    });

    it("catches functions that throw", () => {
      using view = render(nix`io.catch (error: log error.message)
        (io.map (_: throw "broken") (push 1))`);

      expect(view.click()).toEqual([]);
      expect(globalThis.ran).toEqual([1]);
      expect(view.logged()).toEqual([expect.stringMatching(/broken/)]);
    });

    it("skips functions between the failure and the handler", () => {
      using view = render(
        nix`io.catch (error: log "caught") (io.map (_: push 1) ${fail})`,
      );

      view.click();

      expect(globalThis.ran).toBeUndefined();
      expect(view.logged()).toEqual(["caught"]);
    });

    it("lets outer handlers catch inner handlers' failures", () => {
      using view = render(nix`io.catch (error: log error.message)
        (io.catch (error: throw "again") ${fail})`);

      expect(view.click()).toEqual([]);
      expect(view.logged()).toEqual([expect.stringMatching(/again/)]);
    });

    it("reports handlers that fail", () => {
      using view = render(nix`io.catch (error: throw "again") ${fail}`);

      expect(view.click()).toEqual([expect.stringMatching(/again/)]);
    });
  });

  describe("in a pipe", () => {
    it("passes values that aren't effects through", () => {
      expect(
        evaluate(nix`io.pipe 1 [ (io.catch (error: 0)) (n: n + 1) ]`),
      ).toBe(2);
    });

    it("catches failures of every step before it", () => {
      using view = render(nix`io.pipe null [
        (_: ${fail})
        (_: push 1)
        (io.catch (error: 0))
        (n: log n)
      ]`);

      expect(view.click()).toEqual([]);
      expect(globalThis.ran).toBeUndefined();
      expect(view.logged()).toEqual([0]);
    });

    it("passes successes to later steps", () => {
      using view = render(nix`io.pipe null [
        (_: io.call "ten" null)
        (io.catch (error: 0))
        (n: log n)
      ]`);

      view.click();

      expect(view.logged()).toEqual([10]);
    });
  });
});
