import * as cursery from "cursery";

import { load, mount, nix } from "../testing.ts";

/** Loads an app whose `default.nix` has the DOM builders in scope. */
function app(code: string) {
  return load({
    "default.nix": nix`let inherit (import <web/dom>) html; in ${code}`,
  });
}

/** Loads and mounts an app into a new container, as `app` does. */
function render(code: string) {
  using resources = new DisposableStack();
  const { path } = resources.use(app(code));
  const { container } = resources.use(mount(path));
  const owned = resources.move();

  return {
    container,
    /** The first element matching `selector`. */
    get: (selector: string) => container.querySelector<HTMLElement>(selector)!,
    [Symbol.dispose]: () => owned.dispose(),
  };
}

/** Logs actions, rendering the log as JSON in a `<pre>`, around `view`. */
const logger = (view: string) => nix`{
  init = [ ];
  update = state: action: state ++ [ action ];
  render = state: [ (html.pre (builtins.toJSON state)) (${view}) ];
}`;

/** The actions `logger` logged. */
function logged(view: { get: (selector: string) => HTMLElement }) {
  return JSON.parse(view.get("pre").textContent!) as unknown;
}

describe("events", () => {
  it("dispatches actions to `update`", () => {
    using view = render(nix`{
      init = { count = 0; };
      update = state: action: { count = state.count + action; };
      render = state: html.button { on.click = event: 1; } state.count;
    }`);

    view.get("button").click();
    view.get("button").click();

    expect(view.get("button").textContent).toBe("2");
  });

  it("ignores `null`", () => {
    using view = render(logger(nix`html.button { on.click = event: null; }`));
    const pre = view.get("pre");

    view.get("button").click();

    expect(logged(view)).toEqual([]);
    expect(view.get("pre")).toBe(pre);
  });

  it("passes a snapshot of the event", () => {
    using view = render(
      logger(nix`html.button {
        on.click = event: { inherit (event) type button shiftKey; };
      }`),
    );

    view
      .get("button")
      .dispatchEvent(
        new MouseEvent("click", { bubbles: true, button: 1, shiftKey: true }),
      );

    expect(logged(view)).toEqual([
      { type: "click", button: 1, shiftKey: true },
    ]);
  });

  it("skips constants and objects in snapshots", () => {
    using view = render(
      logger(nix`html.button {
        on.click = event: builtins.filter (name: builtins.elem name [
          "AT_TARGET" "view" "currentTarget" "isTrusted"
        ]) (builtins.attrNames event);
      }`),
    );

    view.get("button").click();

    expect(logged(view)).toEqual([["isTrusted"]]);
  });

  it("includes form fields of the target", () => {
    using view = render(
      logger(nix`[
        (html.input { on.input = event: event.target.value; })
        (html.input { type = "checkbox"; on.change = event: event.target.checked; })
      ]`),
    );

    const [text, checkbox] = view.container.querySelectorAll("input");
    text!.value = "typed";
    text!.dispatchEvent(new Event("input", { bubbles: true }));
    checkbox!.checked = true;
    checkbox!.dispatchEvent(new Event("change", { bubbles: true }));

    expect(logged(view)).toEqual(["typed", true]);
  });

  it("bubbles from the target out", () => {
    using view = render(
      logger(nix`html.div { on.click = event: "outer"; } [
        (html.p { on.click = event: "middle"; } [
          (html.button { on.click = event: "inner"; })
        ])
      ]`),
    );

    view.get("button").click();

    expect(logged(view)).toEqual(["inner", "middle", "outer"]);
  });

  it("only calls the target for events that don't bubble", () => {
    using view = render(
      logger(nix`html.div { on.focus = event: "outer"; } [
        (html.input { on.focus = event: "inner"; })
      ]`),
    );

    view.get("input").dispatchEvent(new FocusEvent("focus"));
    view.get("div").dispatchEvent(new FocusEvent("focus"));

    expect(logged(view)).toEqual(["inner", "outer"]);
  });

  it("overrides handlers with `null`", () => {
    using view = render(
      logger(nix`html.button { on.click = event: "a"; } { on.click = null; }`),
    );

    view.get("button").click();

    expect(logged(view)).toEqual([]);
  });

  it("does not render `on` as attributes", () => {
    using view = render(nix`{
      render = state: html.button { id = "a"; on.click = event: null; };
    }`);

    expect(view.container.innerHTML).toBe('<button id="a"></button>');
  });

  it("validates handlers", () => {
    expect(() =>
      render(nix`{ render = state: html.button { on.click = "nope"; }; }`),
    ).toThrow(/Invalid handler \W*on.click\W* of type string/);
    expect(() =>
      render(nix`{ render = state: html.button { on = 1; }; }`),
    ).toThrow(/Invalid `on` of type int/);
  });

  it("uses handlers from the latest mount", () => {
    using view = render(logger(nix`html.button { on.click = event: "old"; }`));
    using next = app(
      logger(nix`html.button {
        on.click = event: "new";
        on.dblclick = event: "added";
      }`),
    );

    cursery.mount(view.container, next.path);
    view.get("button").click();
    view.get("button").dispatchEvent(new MouseEvent("dblclick"));

    expect(logged(view)).toEqual(["new", "added"]);
  });

  it("stops listening on unmount", () => {
    using files = app(logger(nix`html.button { on.click = event: "click"; }`));
    const container = document.createElement("div");
    cursery.mount(container, files.path);
    cursery.unmount(container);

    // Stale listeners would throw, which is reported rather than thrown.
    const errors: unknown[] = [];
    const report = (event: ErrorEvent) => errors.push(event.error);
    window.addEventListener("error", report);
    using _ = mount(files.path, container);
    container.querySelector("button")!.click();
    window.removeEventListener("error", report);

    expect(errors).toEqual([]);
    expect(JSON.parse(container.querySelector("pre")!.textContent!)).toEqual([
      "click",
    ]);
  });

  describe("errors", () => {
    /** Clicks the button, returning what was logged to the console. */
    function click(view: { get: (selector: string) => HTMLElement }) {
      using error = vi.spyOn(console, "error").mockImplementation(() => {});
      view.get("button").click();
      return error.mock.calls.map(([message]) => String(message));
    }

    it("logs and keeps state when `update` throws", () => {
      using view = render(nix`{
        init = { count = 0; };
        update = state: action:
          if action == "boom" then throw "update failed" else { count = 1; };
        render = state: html.p { on.click = event: "ok"; } [
          (html.button { on.click = event: "boom"; } state.count)
        ];
      }`);

      expect(click(view)).toEqual([expect.stringMatching(/update failed/)]);
      expect(view.get("button").textContent).toBe("0");
    });

    it("logs and keeps state when a handler throws", () => {
      using view = render(
        logger(nix`html.button { on.click = event: throw "handler failed"; }`),
      );

      expect(click(view)).toEqual([expect.stringMatching(/handler failed/)]);
      expect(logged(view)).toEqual([]);
    });

    it("logs when an app without `update` dispatches", () => {
      using view = render(nix`{
        render = state: html.button { on.click = event: "action"; };
      }`);

      expect(click(view)).toEqual([
        expect.stringMatching(/without an `update`/),
      ]);
    });

    it("logs and keeps state when rendering fails", () => {
      using view = render(nix`{
        init = 0;
        update = state: action: state + 1;
        render = state:
          if state > 0 then throw "render failed"
          else html.button { on.click = event: 1; } state;
      }`);

      expect(click(view)).toEqual([expect.stringMatching(/render failed/)]);
      expect(click(view)).toEqual([expect.stringMatching(/render failed/)]);
    });
  });
});
