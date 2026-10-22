import * as cursery from "cursery";

import { load, mount, nix } from "../testing.ts";

/** Loads an app whose `default.nix` has the DOM builders in scope. */
function app(code: string) {
  return load({
    "default.nix": nix`let inherit (import <web/dom>) element html; in ${code}`,
  });
}

/** Loads and mounts an app into a new container, as `app` does. */
function render(code: string) {
  // Released here if mounting throws, otherwise by the caller.
  using resources = new DisposableStack();
  const { path } = resources.use(app(code));
  const { container } = resources.use(mount(path));
  const owned = resources.move();

  return { container, [Symbol.dispose]: () => owned.dispose() };
}

describe("mount", () => {
  it("renders elements", () => {
    using view = render(nix`{
      render = state: html.main { id = "root"; } [
        (html.h1 "Title")
        (html.p { class = "body"; } [ "Hello " (html.b "world") ])
      ];
    }`);

    expect(view.container.innerHTML).toBe(
      '<main id="root"><h1>Title</h1><p class="body">Hello <b>world</b></p></main>',
    );
  });

  it("renders any children at the root", () => {
    using view = render(nix`{
      render = state: [ "text" (html.hr) [ 1 null ] ];
    }`);

    expect(view.container.innerHTML).toBe("text<hr>1");
  });

  it("passes empty state", () => {
    using view = render(nix`{
      render = state: builtins.toJSON state;
    }`);

    expect(view.container.textContent).toBe("{}");
  });

  it("renders nothing without `render`", () => {
    using view = render(nix`{ }`);

    expect(view.container.innerHTML).toBe("");
  });

  it("escapes text", () => {
    using view = render(nix`{
      render = state: html.p { title = "<\\"&>"; } "<b>not bold</b>";
    }`);

    expect(view.container.firstElementChild?.getAttribute("title")).toBe(
      '<"&>',
    );
    expect(view.container.textContent).toBe("<b>not bold</b>");
  });

  it("imports from subdirectories", () => {
    using files = load({
      "app/default.nix": nix`{ render = state: import ./view.nix; }`,
      "app/view.nix": nix`"from view"`,
    });

    using view = mount(`${files.path}/app`);

    expect(view.container.textContent).toBe("from view");
  });

  it("replaces existing content", () => {
    const container = document.createElement("div");
    container.innerHTML = "<p>old</p>";
    using files = app(nix`{ render = state: "new"; }`);

    using _ = mount(files.path, container);

    expect(container.innerHTML).toBe("new");
  });

  it("leaves the container untouched on errors", () => {
    const container = document.createElement("div");
    container.innerHTML = "<p>old</p>";
    using files = app(nix`{
      render = state: [ (html.p "fine") (html.p { a = [ ]; }) ];
    }`);

    expect(() => cursery.mount(container, files.path)).toThrow(
      /Invalid attribute \W*a\W* of type list/,
    );
    expect(container.innerHTML).toBe("<p>old</p>");
  });

  it("throws on invalid tag names", () => {
    expect(() =>
      render(nix`{ render = state: html.p (element "a b"); }`),
    ).toThrow(/InvalidCharacterError/);
  });

  it("throws on evaluation errors", () => {
    expect(() => render(nix`{ render = state: throw "boom"; }`)).toThrow(
      /boom/,
    );
  });

  it("throws on missing apps", () => {
    const container = document.createElement("div");

    expect(() => cursery.mount(container, "/nix/store/missing")).toThrow();
  });

  describe("again", () => {
    /** Renders `before`, then mounts `after` into the same container. */
    function rerender(before: string, after: string): string {
      using view = render(before);
      using next = app(after);
      cursery.mount(view.container, next.path);

      return view.container.innerHTML;
    }

    it("keeps unchanged nodes", () => {
      using view = render(nix`{
        render = state: html.ul [ (html.li "a") (html.li "b") ];
      }`);

      const before = [...view.container.querySelectorAll("li")];
      using next = app(nix`{
        render = state: html.ul [ (html.li "a") (html.li "c") ];
      }`);

      cursery.mount(view.container, next.path);

      expect(view.container.innerHTML).toBe("<ul><li>a</li><li>c</li></ul>");
      expect([...view.container.querySelectorAll("li")]).toEqual(before);
    });

    it("updates attributes", () => {
      using view = render(nix`{
        render = state: html.p { id = "a"; class = "b"; title = "c"; } [ ];
      }`);

      const p = view.container.firstChild;
      using next = app(nix`{
        render = state: html.p { id = "x"; title = null; lang = "en"; } [ ];
      }`);

      cursery.mount(view.container, next.path);

      expect(view.container.firstChild).toBe(p);
      expect(view.container.innerHTML).toBe('<p id="x" lang="en"></p>');
    });

    it("adds and removes children", () => {
      const short = nix`{ render = state: [ "a" ]; }`;
      const long = nix`{ render = state: [ "a" "b" (html.hr) ]; }`;

      expect(rerender(short, long)).toBe("ab<hr>");
      expect(rerender(long, short)).toBe("a");
    });

    it("replaces nodes that change type", () => {
      expect(
        rerender(
          nix`{ render = state: [ (html.p "a") "b" (html.i "c") ]; }`,
          nix`{ render = state: [ (html.div "a") (html.b "b") "c" ]; }`,
        ),
      ).toBe("<div>a</div><b>b</b>c");
    });

    it("leaves the container untouched on errors", () => {
      using view = render(nix`{
        render = state: [ (html.p "a") (html.p "b") ];
      }`);

      const before = view.container.innerHTML;
      using invalidAttribute = app(nix`{
        render = state: [ (html.p "changed") (html.p { "a b" = "c"; } "b") ];
      }`);

      using invalidTag = app(nix`{
        render = state: [ (html.p "changed") (element "a b") ];
      }`);

      expect(() =>
        cursery.mount(view.container, invalidAttribute.path),
      ).toThrow(/InvalidCharacterError/);
      expect(() => cursery.mount(view.container, invalidTag.path)).toThrow(
        /InvalidCharacterError/,
      );
      expect(view.container.innerHTML).toBe(before);
    });

    it("patches from the last successful render", () => {
      using view = render(nix`{ render = state: "a"; }`);
      using broken = app(nix`{ render = state: throw "boom"; }`);
      using fixed = app(nix`{ render = state: "b"; }`);

      expect(() => cursery.mount(view.container, broken.path)).toThrow(/boom/);
      cursery.mount(view.container, fixed.path);

      expect(view.container.innerHTML).toBe("b");
    });
  });
});

describe("properties", () => {
  it("sets form state as properties, not attributes", () => {
    using view = render(nix`{
      render = state: [
        (html.input { value = "text"; })
        (html.input { type = "checkbox"; checked = true; })
        (html.textarea { value = "area"; })
      ];
    }`);

    const [text, checkbox] = view.container.querySelectorAll("input");

    expect(view.container.innerHTML).toBe(
      '<input><input type="checkbox"><textarea></textarea>',
    );
    expect(text!.value).toBe("text");
    expect(checkbox!.checked).toBe(true);
    expect(view.container.querySelector("textarea")!.value).toBe("area");
  });

  it("selects options", () => {
    using view = render(nix`{
      render = state: [
        (html.select { value = "b"; } [ (html.option "a") (html.option "b") ])
        (html.select [
          (html.option "c")
          (html.option { selected = true; } "d")
        ])
      ];
    }`);

    const [byValue, bySelected] = view.container.querySelectorAll("select");

    expect(byValue!.value).toBe("b");
    expect(bySelected!.value).toBe("d");
  });

  it("keeps attributes on other elements", () => {
    using view = render(nix`{
      render = state: [
        (html.li { value = "3"; })
        (element "my-input" { value = "a"; checked = true; })
      ];
    }`);

    expect(view.container.innerHTML).toBe(
      '<li value="3"></li><my-input checked="" value="a"></my-input>',
    );
  });

  it("overwrites changes from people when patching", () => {
    using view = render(nix`{
      render = state: [
        (html.input { value = "a"; })
        (html.input { type = "checkbox"; checked = false; })
      ];
    }`);

    const [text, checkbox] = view.container.querySelectorAll("input");
    text!.value = "typed";
    checkbox!.checked = true;
    using next = app(nix`{
      render = state: [
        (html.input { value = "a"; })
        (html.input { type = "checkbox"; checked = null; })
      ];
    }`);

    cursery.mount(view.container, next.path);

    expect(text!.value).toBe("a");
    expect(checkbox!.checked).toBe(false);
  });

  it("leaves absent properties alone", () => {
    using view = render(nix`{ render = state: html.input { value = "a"; }; }`);

    const input = view.container.querySelector("input")!;
    input.value = "typed";
    using next = app(nix`{ render = state: html.input; }`);

    cursery.mount(view.container, next.path);

    expect(input.value).toBe("typed");
  });

  it("clears `null` values", () => {
    using view = render(nix`{ render = state: html.input { value = null; }; }`);

    const input = view.container.querySelector("input")!;
    input.value = "typed";
    using next = app(nix`{ render = state: html.input { value = null; }; }`);

    cursery.mount(view.container, next.path);

    expect(input.value).toBe("");
  });
});

describe("state", () => {
  /** An app rendering `init` as JSON. */
  const counter = (init: string) => nix`{
    init = ${init};
    update = state: action: state;
    render = state: builtins.toJSON state;
  }`;

  it("renders `init`", () => {
    using view = render(counter(nix`{ count = 1; }`));

    expect(view.container.textContent).toBe('{"count":1}');
  });

  it("evaluates state strictly", () => {
    expect(() =>
      render(nix`{
        init = { unused = throw "boom"; };
        update = state: action: state;
        render = state: "ignores state";
      }`),
    ).toThrow(/boom/);
  });

  it("requires `init` and `update` together", () => {
    expect(() => render(nix`{ init = { }; }`)).toThrow(/must define both/);
    expect(() => render(nix`{ update = state: action: state; }`)).toThrow(
      /must define both/,
    );
  });

  it("validates the app", () => {
    expect(() => render(nix`42`)).toThrow(/Invalid app of type int/);
    expect(() => render(nix`{ init = { }; update = { }; }`)).toThrow(
      /Invalid `update` of type set/,
    );
    expect(() => render(nix`{ render = "hello"; }`)).toThrow(
      /Invalid `render` of type string/,
    );
  });

  it("keeps state across mounts", () => {
    using view = render(counter(nix`{ count = 1; }`));
    using next = app(counter(nix`{ count = 2; }`));

    cursery.mount(view.container, next.path);

    expect(view.container.textContent).toBe('{"count":1}');
  });

  it("uses `init` when the previous app had no state", () => {
    using view = render(nix`{ render = state: builtins.toJSON state; }`);
    using next = app(counter(nix`{ count = 1; }`));

    cursery.mount(view.container, next.path);

    expect(view.container.textContent).toBe('{"count":1}');
  });

  it("drops state when the app no longer has any", () => {
    using view = render(counter(nix`{ count = 1; }`));
    using stateless = app(nix`{ render = state: builtins.toJSON state; }`);
    using stateful = app(counter(nix`{ count = 2; }`));

    cursery.mount(view.container, stateless.path);
    expect(view.container.textContent).toBe("{}");

    cursery.mount(view.container, stateful.path);
    expect(view.container.textContent).toBe('{"count":2}');
  });

  it("keeps state through failed mounts", () => {
    using view = render(counter(nix`{ count = 1; }`));
    using broken = app(nix`{ init = { }; }`);
    using next = app(counter(nix`{ count = 2; }`));

    expect(() => cursery.mount(view.container, broken.path)).toThrow(
      /must define both/,
    );
    cursery.mount(view.container, next.path);

    expect(view.container.textContent).toBe('{"count":1}');
  });

  it("forgets state on unmount", () => {
    const container = document.createElement("div");
    using first = app(counter(nix`{ count = 1; }`));
    using second = app(counter(nix`{ count = 2; }`));
    cursery.mount(container, first.path);
    cursery.unmount(container);

    using _ = mount(second.path, container);

    expect(container.textContent).toBe('{"count":2}');
  });
});

describe("unmount", () => {
  it("clears the container", () => {
    using files = app(nix`{ render = state: "hello"; }`);
    const container = document.createElement("div");
    cursery.mount(container, files.path);

    cursery.unmount(container);

    expect(container.innerHTML).toBe("");
  });

  it("forgets the previous render", () => {
    using files = app(nix`{ render = state: "new"; }`);
    const container = document.createElement("div");
    cursery.mount(container, files.path);
    cursery.unmount(container);

    container.innerHTML = "<p>unmanaged</p>";
    using _ = mount(files.path, container);

    expect(container.innerHTML).toBe("new");
  });

  it("throws if nothing is mounted", () => {
    expect(() => cursery.unmount(document.createElement("div"))).toThrow(
      /Nothing is mounted/,
    );
  });
});
