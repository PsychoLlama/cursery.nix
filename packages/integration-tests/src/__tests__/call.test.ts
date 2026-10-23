import * as cursery from "cursery";

import { load, mount, nix } from "../testing.ts";

type Effects = NonNullable<cursery.MountOptions["effects"]>;

/** Evaluates `code` with `io` in scope. */
function evaluate(code: string) {
  return cursery.evaluate(nix`let io = import <web/io>; in ${code}`);
}

/**
 * Loads and mounts an app with `effects`, and `html`, `io`, and `log`
 * (dispatching a `log` action) in scope, logging payloads into a `<pre>`
 * around a button running `handler`.
 */
function render(handler: string, effects: Effects) {
  using resources = new DisposableStack();
  const { path } = resources.use(
    load({
      "default.nix": nix`let
        inherit (import <web/dom>) html;
        io = import <web/io>;
        log = io.dispatch "log";
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
    path,
    container,

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

/** Clicks a button calling `effect` with `input`, returning its output. */
function output(effect: Effects[string], input = "null") {
  using view = render(nix`io.map (out: log out) (io.call "effect" ${input})`, {
    effect,
  });

  expect(view.click()).toEqual([]);
  return view.logged();
}

/** Waits for pending promises, and whatever they resume, to settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

/** Clicks a button running `handler`, returning the console errors. */
function errors(handler: string, effects: Effects = {}) {
  using view = render(handler, effects);
  return view.click();
}

describe("call", () => {
  it("describes an effect", () => {
    expect(evaluate(nix`io.call "hi" { n = 1; }`)).toEqual({
      _type: "effect",
      kind: "call",
      inputs: { name: "hi", input: { n: 1 } },
    });
  });

  it("passes the input to the effect", () => {
    const effect = vi.fn();
    output(effect, nix`{ list = [ 1 "two" true null ]; }`);

    expect(effect).toHaveBeenCalledExactlyOnceWith({
      list: [1, "two", true, null],
    });
  });

  it("outputs what the effect returns", () => {
    expect(output(() => ({ list: [1, 2.5, "three", true, null] }))).toEqual([
      { list: [1, 2.5, "three", true, null] },
    ]);
  });

  it("outputs null for undefined", () => {
    expect(output(() => undefined)).toEqual([null]);
  });

  it("converts the output as JSON does", () => {
    expect(
      output(() => ({ gone: undefined, date: new Date(0), list: [undefined] })),
    ).toEqual([{ date: "1970-01-01T00:00:00.000Z", list: [null] }]);
  });

  it("runs each time it's returned", () => {
    let count = 0;
    using view = render(
      nix`io.map (outputs: log outputs) (io.all [ (io.call "count" null) (io.call "count" null) ])`,
      { count: () => ++count },
    );

    view.click();
    view.click();

    expect(view.logged()).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it("fails catchably", () => {
    using view = render(
      nix`io.catch (error: log error.message) (io.call "fail" null)`,
      {
        fail: () => {
          throw new Error("nope");
        },
      },
    );

    expect(view.click()).toEqual([]);
    expect(view.logged()).toEqual(['Effect "fail" failed: Error: nope']);
  });

  it("uses the effects of the latest mount", () => {
    using view = render(nix`io.map (out: log out) (io.call "name" null)`, {
      name: () => "first",
    });

    cursery.mount(view.container, view.path, {
      effects: { name: () => "second" },
    });
    view.click();

    expect(view.logged()).toEqual(["second"]);
  });

  describe("errors", () => {
    it("reports thrown errors, naming the effect", () => {
      expect(
        errors(nix`io.call "fail" null`, {
          fail: () => {
            throw new Error("nope");
          },
        }),
      ).toEqual([expect.stringMatching(/Effect "fail" failed: Error: nope/)]);
    });

    it("reports missing effects", () => {
      expect(errors(nix`io.call "missing" null`)).toEqual([
        expect.stringMatching(/No effect "missing": pass it to `mount`/),
      ]);
      expect(errors(nix`io.call "toString" null`)).toEqual([
        expect.stringMatching(/No effect "toString"/),
      ]);
    });

    it("rejects inputs JS can't represent", () => {
      expect(
        errors(nix`io.call "effect" (x: x)`, { effect: () => {} }),
      ).toEqual([
        expect.stringMatching(/Effect "effect" failed: Invalid input/),
      ]);
    });

    it("validates the name", () => {
      expect(() => evaluate(nix`io.call 1 null`)).toThrow(
        /Invalid effect name of type int/,
      );
    });

    it("rejects effects that aren't functions", () => {
      using app = load({ "default.nix": nix`{ }` });
      const effects = { focus: "nope" } as never;

      expect(() => mount(app.path, { effects })).toThrow(
        /Invalid mount options: expected effect "focus" to be a function/,
      );
      expect(() => mount(app.path, { effects: 1 as never })).toThrow(
        /Invalid mount options: expected `effects` to be an object/,
      );
    });
  });

  describe("promises", () => {
    it("output what they resolve to", async () => {
      using view = render(nix`io.map (out: log out) (io.call "wait" null)`, {
        wait: () => Promise.resolve({ list: [1, "two"] }),
      });

      view.click();
      await settle();

      expect(view.logged()).toEqual([{ list: [1, "two"] }]);
    });

    it("pause the chain until they settle", async () => {
      const { promise, resolve } = Promise.withResolvers();
      using view = render(
        nix`io.pipe null [
          (_: log "before")
          (_: io.call "wait" null)
          (out: log out)
        ]`,
        { wait: () => promise },
      );

      expect(view.click()).toEqual([]);
      expect(view.logged()).toEqual(["before"]);

      resolve("after");
      await settle();

      expect(view.logged()).toEqual(["before", "after"]);
    });

    it("don't block other chains", async () => {
      const waiting: ((value: unknown) => void)[] = [];
      using view = render(nix`io.map (out: log out) (io.call "wait" null)`, {
        wait: () => new Promise((resolve) => waiting.push(resolve)),
      });

      view.click();
      view.click();
      waiting[1]!("second");
      await settle();
      waiting[0]!("first");
      await settle();

      expect(view.logged()).toEqual(["second", "first"]);
    });

    it("adopt thenables", async () => {
      using view = render(nix`io.map (out: log out) (io.call "wait" null)`, {
        wait: () => ({
          then: (resolve: (value: number) => void) => resolve(1),
        }),
      });

      view.click();
      await settle();

      expect(view.logged()).toEqual([1]);
    });

    it("fail catchably when rejected", async () => {
      using view = render(
        nix`io.catch (error: log error.message) (io.call "fail" null)`,
        { fail: () => Promise.reject(new Error("nope")) },
      );

      view.click();
      await settle();

      expect(view.logged()).toEqual(['Effect "fail" failed: Error: nope']);
    });

    it("report failures nothing catches", async () => {
      using view = render(nix`io.call "fail" null`, {
        fail: () => Promise.reject(new Error("nope")),
      });

      view.click();
      // `click` restores `console.error` when it returns.
      using error = vi.spyOn(console, "error").mockImplementation(() => {});
      await settle();

      expect(error.mock.calls.map(([message]) => String(message))).toEqual([
        expect.stringMatching(/Effect "fail" failed: Error: nope/),
      ]);
    });

    it("report outputs JSON can't represent", async () => {
      using view = render(nix`io.call "wait" null`, {
        wait: () => Promise.resolve(1n),
      });

      view.click();
      // `click` restores `console.error` when it returns.
      using error = vi.spyOn(console, "error").mockImplementation(() => {});
      await settle();

      expect(error.mock.calls.map(([message]) => String(message))).toEqual([
        expect.stringMatching(/Effect "wait" failed: Invalid output/),
      ]);
    });

    it("outlive the event", async () => {
      using view = render(
        nix`io.pipe null [ (_: io.call "wait" null) (_: event.preventDefault) ]`,
        { wait: () => Promise.resolve() },
      );

      view.click();
      // `click` restores `console.error` when it returns.
      using error = vi.spyOn(console, "error").mockImplementation(() => {});
      await settle();

      expect(error.mock.calls.map(([message]) => String(message))).toEqual([
        expect.stringMatching(
          /Cannot preventDefault: event \d+ finished dispatching/,
        ),
      ]);
    });

    it("keep running across mounts of the same app", async () => {
      const { promise, resolve } = Promise.withResolvers();
      using view = render(nix`io.map (out: log out) (io.call "wait" null)`, {
        wait: () => promise,
      });

      view.click();
      cursery.mount(view.container, view.path, {
        effects: { wait: () => promise },
      });
      resolve("done");
      await settle();

      expect(view.logged()).toEqual(["done"]);
    });

    it("are dropped once the app unmounts", async () => {
      const { promise, resolve } = Promise.withResolvers();
      const after = vi.fn();
      const view = render(
        nix`io.pipe null [ (_: io.call "wait" null) (_: io.call "after" null) ]`,
        { wait: () => promise, after },
      );

      view.click();
      using error = vi.spyOn(console, "error").mockImplementation(() => {});
      view[Symbol.dispose]();
      resolve(null);
      await settle();

      expect(after).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    });

    it("are dropped when another app mounts in its place", async () => {
      const { promise, resolve } = Promise.withResolvers();
      const after = vi.fn();
      const view = render(
        nix`io.pipe null [ (_: io.call "wait" null) (_: io.call "after" null) ]`,
        { wait: () => promise, after },
      );

      view.click();
      cursery.unmount(view.container);
      using _ = mount(view.path, {
        container: view.container,
        effects: { after },
      });
      resolve(null);
      await settle();

      expect(after).not.toHaveBeenCalled();
    });
  });
});
