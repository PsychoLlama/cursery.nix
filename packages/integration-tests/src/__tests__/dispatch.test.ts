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
        io = import <web/io>;
        inherit (io) dispatch;
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
  it("describes an effect", () => {
    expect(evaluate(nix`io.dispatch "add" { text = "milk"; }`)).toEqual({
      _type: "effect",
      kind: "dispatch",
      inputs: { type: "add", payload: { text: "milk" } },
    });
  });

  it("is a plain function until given a payload", () => {
    expect(evaluate(nix`builtins.isFunction (io.dispatch "add")`)).toBe(true);
  });

  it("keeps the payload as a Nix value", () => {
    expect(
      evaluate(nix`(io.dispatch "call" (x: x + 1)).inputs.payload 1`),
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
          (html.button { id = "bare"; on.click = event: dispatch "bare" null; })
          (html.button { id = "full"; on.click = event: dispatch "full" { n = 1; }; })
        ];
      }`);

      view.get("#bare").click();
      view.get("#full").click();

      expect(shown(view)).toEqual([
        { type: "bare", payload: null },
        { type: "full", payload: { n: 1 } },
      ]);
    });

    it("renders, then outputs the next state", () => {
      using view = render(nix`{
        init = { count = 0; seen = null; };
        update = state: action:
          if action.type == "increment" then state // { count = state.count + 1; }
          else state // { seen = action.payload; };
        render = state: [
          (html.pre (builtins.toJSON state))
          (html.button {
            on.click = event: io.map (result: dispatch "see" result) (dispatch "increment" null);
          })
        ];
      }`);

      view.get("button").click();

      expect(shown(view)).toEqual({
        count: 1,
        seen: { count: 1, seen: null },
      });
    });

    it("runs the same dispatch each time", () => {
      using view = render(nix`{
        init = 0;
        update = state: action: state + 1;
        render = state: [
          (html.pre (builtins.toJSON state))
          (html.button {
            on.click = event:
              let increment = dispatch "increment" null; in
              io.map (outputs: if outputs == [ 1 2 ] then null else throw "not run twice")
                (io.all [ increment increment ]);
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
              io.map (result: if result == 1 then throw "later" else null) (dispatch "increment" null);
          })
        ];
      }`);

      expect(errors(view)).toEqual([expect.stringMatching(/later/)]);
      expect(shown(view)).toBe(1);
    });

    it("treats effects inside the state as data", () => {
      using view = render(nix`{
        init = { types = [ ]; };
        update = state: action: {
          effect = dispatch "nested" null;
          types = state.types ++ [ action.type ];
        };
        render = state: [
          (html.pre (builtins.toJSON state.types))
          (html.button { on.click = event: dispatch "outer" null; })
        ];
      }`);

      expect(errors(view)).toEqual([]);
      expect(shown(view)).toEqual(["outer"]);
    });
  });

  describe("effects from `update`", () => {
    it("run instead of updating the state", () => {
      using view = render(nix`{
        init = [ ];
        update = state: action:
          if action.type == "save" then dispatch "saved" action.payload
          else state ++ [ action ];
        render = state: [
          (html.pre (builtins.toJSON state))
          (html.button { on.click = event: dispatch "save" 1; })
        ];
      }`);

      view.get("button").click();

      expect(shown(view)).toEqual([{ type: "saved", payload: 1 }]);
    });

    it("output what the effect outputs", () => {
      using view = render(nix`{
        init = { count = 0; seen = null; };
        update = state: action:
          if action.type == "fetch" then io.map (state: state.count * 10) (dispatch "increment" null)
          else if action.type == "increment" then state // { count = state.count + 1; }
          else state // { seen = action.payload; };
        render = state: [
          (html.pre (builtins.toJSON state))
          (html.button {
            on.click = event: io.map (result: dispatch "see" result) (dispatch "fetch" null);
          })
        ];
      }`);

      view.get("button").click();

      expect(shown(view)).toEqual({ count: 1, seen: 10 });
    });

    it("fail where they were dispatched", () => {
      using view = render(nix`{
        init = null;
        update = state: action:
          if action.type == "risky" then io.map (_: throw "nope") (dispatch "step" null)
          else action.payload;
        render = state: [
          (html.pre (builtins.toJSON state))
          (html.button {
            on.click = event: io.catch (error: dispatch "failed" error.message) (dispatch "risky" null);
          })
        ];
      }`);

      expect(errors(view)).toEqual([]);
      expect(shown(view)).toMatch(/nope/);
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

    it("rejects lists, suggesting `io.all`", () => {
      using view = render(nix`{
        init = 0;
        update = state: action: state + 1;
        render = state: [
          (html.pre (builtins.toJSON state))
          (html.button { on.click = event: [ (dispatch "increment" null) ]; })
        ];
      }`);

      expect(errors(view)).toEqual([
        expect.stringMatching(
          /Invalid handler result of type list: return `io.all` to run several effects/,
        ),
      ]);
      expect(shown(view)).toBe(0);
    });

    it("throws errors of returned effects", () => {
      using view = render(nix`{
        render = state: html.button {
          on.click = event: io.call "missing" null;
        };
      }`);

      expect(errors(view)).toEqual([
        expect.stringMatching(/No effect "missing"/),
      ]);
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

describe("dispatch from JS", () => {
  /** Mounts an app with `html` and `io` in scope. */
  function host(code: string, options: cursery.MountOptions = {}) {
    using resources = new DisposableStack();
    const { path } = resources.use(
      load({
        "default.nix": nix`let
          inherit (import <web/dom>) html;
          io = import <web/io>;
        in ${code}`,
      }),
    );
    const view = resources.use(mount(path, options));
    const owned = resources.move();

    return {
      container: view.container,
      shown: () =>
        JSON.parse(
          view.container.querySelector("pre")!.textContent!,
        ) as unknown,
      [Symbol.dispose]: () => owned.dispose(),
    };
  }

  /** An app showing the actions it was given. */
  const log = nix`{
    init = [ ];
    update = state: action: state ++ [ action ];
    render = state: html.pre (builtins.toJSON state);
  }`;

  it("updates and renders before returning", () => {
    using app = host(log);

    cursery.dispatch(app.container, "add", { text: "milk", tags: ["a"] });

    expect(app.shown()).toEqual([
      { type: "add", payload: { text: "milk", tags: ["a"] } },
    ]);
  });

  it("defaults the payload to null", () => {
    using app = host(log);

    cursery.dispatch(app.container, "bare");
    cursery.dispatch(app.container, "null", null);

    expect(app.shown()).toEqual([
      { type: "bare", payload: null },
      { type: "null", payload: null },
    ]);
  });

  it("runs the effect `update` returns", () => {
    const greet = vi.fn();
    using app = host(
      nix`{
        init = null;
        update = state: action: io.call "greet" action.payload;
        render = state: html.pre "null";
      }`,
      { effects: { greet } },
    );

    cursery.dispatch(app.container, "greet", "hi");

    expect(greet).toHaveBeenCalledWith("hi");
  });

  it("throws when `update` fails, keeping the state", () => {
    using app = host(nix`{
      init = 0;
      update = state: action: if action.type == "fail" then throw "boom" else state + 1;
      render = state: html.pre (builtins.toJSON state);
    }`);

    cursery.dispatch(app.container, "increment");

    expect(() => cursery.dispatch(app.container, "fail")).toThrow(/boom/);
    expect(app.shown()).toBe(1);
  });

  it("throws when an effect fails", () => {
    using app = host(nix`{
      init = null;
      update = state: action: io.call "missing" null;
      render = state: html.pre "null";
    }`);

    expect(() => cursery.dispatch(app.container, "call")).toThrow(/missing/);
  });

  it("rejects payloads that aren't JSON data", () => {
    using app = host(log);

    expect(() => cursery.dispatch(app.container, "add", () => {})).toThrow(
      /Invalid payload: expected JSON data/,
    );
    expect(() => cursery.dispatch(app.container, "add", 1n)).toThrow(
      /Invalid payload: expected JSON data/,
    );
  });

  it("throws when nothing is mounted", () => {
    expect(() =>
      cursery.dispatch(document.createElement("div"), "add"),
    ).toThrow(/Nothing is mounted in the container/);
  });

  it("throws while the app renders", () => {
    // Dispatches when inserted, mid-render.
    let error: unknown;
    customElements.define(
      "dispatch-on-connect",
      class extends HTMLElement {
        connectedCallback() {
          try {
            cursery.dispatch(this.parentElement!, "again");
          } catch (thrown) {
            error = thrown;
          }
        }
      },
    );

    using app = host(nix`{
      init = false;
      update = state: action: true;
      render = shown: if shown then (import <web/dom>).element "dispatch-on-connect" else null;
    }`);

    // Custom elements only connect in the document.
    document.body.append(app.container);
    using _detach = { [Symbol.dispose]: () => app.container.remove() };
    cursery.dispatch(app.container, "show");

    expect(String(error)).toMatch(/Cannot dispatch while the app is rendering/);
  });
});
