import * as nix from "cursery";

describe("mount", () => {
  const loaded: string[] = [];
  const mounted: Element[] = [];

  afterEach(() => {
    loaded.splice(0).forEach((path) => nix.unload(path));
    mounted.splice(0).forEach((container) => nix.unmount(container));
  });

  /** Loads an app with the given `default.nix`, returning its path. */
  function load(app: string): string {
    const path = nix.load({
      "default.nix": `let inherit (import <web/dom>) element html; in ${app}`,
    });

    loaded.push(path);
    return path;
  }

  /** Mounts `path` into `container`, unmounting it after the test. */
  function mountInto(container: Element, path: string) {
    nix.mount(container, path);
    if (!mounted.includes(container)) mounted.push(container);
  }

  /** Mounts an app with the given `default.nix` into a new container. */
  function mount(app: string): HTMLElement {
    const container = document.createElement("div");
    mountInto(container, load(app));

    return container;
  }

  it("renders elements", () => {
    const container = mount(`{
      render = state: html.main { id = "root"; } [
        (html.h1 "Title")
        (html.p { class = "body"; } [ "Hello " (html.b "world") ])
      ];
    }`);

    expect(container.innerHTML).toBe(
      '<main id="root"><h1>Title</h1><p class="body">Hello <b>world</b></p></main>',
    );
  });

  it("renders any children at the root", () => {
    const container = mount(`{
      render = state: [ "text" (html.hr) [ 1 null ] ];
    }`);

    expect(container.innerHTML).toBe("text<hr>1");
  });

  it("passes empty state", () => {
    const container = mount(`{
      render = state: builtins.toJSON state;
    }`);

    expect(container.textContent).toBe("{}");
  });

  it("renders nothing without `render`", () => {
    expect(mount("{ }").innerHTML).toBe("");
  });

  it("escapes text", () => {
    const container = mount(`{
      render = state: html.p { title = "<\\"&>"; } "<b>not bold</b>";
    }`);

    expect(container.firstElementChild?.getAttribute("title")).toBe('<"&>');
    expect(container.textContent).toBe("<b>not bold</b>");
  });

  it("imports from subdirectories", () => {
    const path = nix.load({
      "app/default.nix": `{ render = state: import ./view.nix; }`,
      "app/view.nix": `"from view"`,
    });

    loaded.push(path);
    const container = document.createElement("div");
    mountInto(container, `${path}/app`);

    expect(container.textContent).toBe("from view");
  });

  it("replaces existing content", () => {
    const container = document.createElement("div");
    container.innerHTML = "<p>old</p>";
    const path = nix.load({ "default.nix": `{ render = state: "new"; }` });
    loaded.push(path);

    mountInto(container, path);

    expect(container.innerHTML).toBe("new");
  });

  it("leaves the container untouched on errors", () => {
    const container = document.createElement("div");
    container.innerHTML = "<p>old</p>";
    const path = nix.load({
      "default.nix": `let inherit (import <web/dom>) html; in {
        render = state: [ (html.p "fine") (html.p { a = [ ]; }) ];
      }`,
    });

    loaded.push(path);

    expect(() => nix.mount(container, path)).toThrow(
      /Invalid attribute \W*a\W* of type list/,
    );
    expect(container.innerHTML).toBe("<p>old</p>");
  });

  it("throws on invalid tag names", () => {
    expect(() => mount(`{ render = state: html.p (element "a b"); }`)).toThrow(
      /InvalidCharacterError/,
    );
  });

  it("throws on evaluation errors", () => {
    expect(() => mount(`{ render = state: throw "boom"; }`)).toThrow(/boom/);
  });

  it("throws on missing apps", () => {
    const container = document.createElement("div");

    expect(() => nix.mount(container, "/nix/store/missing")).toThrow();
  });

  describe("again", () => {
    /** Mounts `before`, then `after` into the same container. */
    function remount(before: string, after: string): HTMLElement {
      const container = mount(before);
      mountInto(container, load(after));

      return container;
    }

    it("keeps unchanged nodes", () => {
      const container = mount(`{
        render = state: html.ul [ (html.li "a") (html.li "b") ];
      }`);
      const [a, b] = container.querySelectorAll("li");

      mountInto(
        container,
        load(`{ render = state: html.ul [ (html.li "a") (html.li "c") ]; }`),
      );

      const [newA, newB] = container.querySelectorAll("li");
      expect(container.innerHTML).toBe("<ul><li>a</li><li>c</li></ul>");
      expect(newA).toBe(a);
      expect(newB).toBe(b);
    });

    it("updates attributes", () => {
      const container = mount(`{
        render = state: html.p { id = "a"; class = "b"; title = "c"; } [ ];
      }`);
      const p = container.firstChild;

      mountInto(
        container,
        load(
          `{ render = state: html.p { id = "x"; title = null; lang = "en"; } [ ]; }`,
        ),
      );

      expect(container.firstChild).toBe(p);
      expect(container.innerHTML).toBe('<p id="x" lang="en"></p>');
    });

    it("adds and removes children", () => {
      expect(
        remount(
          `{ render = state: [ "a" ]; }`,
          `{ render = state: [ "a" "b" (html.hr) ]; }`,
        ).innerHTML,
      ).toBe("ab<hr>");
      expect(
        remount(
          `{ render = state: [ "a" "b" (html.hr) ]; }`,
          `{ render = state: [ "a" ]; }`,
        ).innerHTML,
      ).toBe("a");
    });

    it("replaces nodes that change type", () => {
      const container = remount(
        `{ render = state: [ (html.p "a") "b" (html.i "c") ]; }`,
        `{ render = state: [ (html.div "a") (html.b "b") "c" ]; }`,
      );

      expect(container.innerHTML).toBe("<div>a</div><b>b</b>c");
    });

    it("leaves the container untouched on errors", () => {
      const container = mount(`{
        render = state: [ (html.p "a") (html.p "b") ];
      }`);

      const before = container.innerHTML;
      const invalidAttribute = load(`{
        render = state: [ (html.p "changed") (html.p { "a b" = "c"; } "b") ];
      }`);
      const invalidTag = load(`{
        render = state: [ (html.p "changed") (element "a b") ];
      }`);

      expect(() => nix.mount(container, invalidAttribute)).toThrow(
        /InvalidCharacterError/,
      );
      expect(() => nix.mount(container, invalidTag)).toThrow(
        /InvalidCharacterError/,
      );
      expect(container.innerHTML).toBe(before);
    });

    it("patches from the last successful render", () => {
      const container = mount(`{ render = state: "a"; }`);

      expect(() =>
        nix.mount(container, load(`{ render = state: throw "boom"; }`)),
      ).toThrow(/boom/);
      mountInto(container, load(`{ render = state: "b"; }`));

      expect(container.innerHTML).toBe("b");
    });
  });
});

describe("unmount", () => {
  it("clears the container", () => {
    const path = nix.load({ "default.nix": `{ render = state: "hello"; }` });
    const container = document.createElement("div");
    nix.mount(container, path);

    nix.unmount(container);
    nix.unload(path);

    expect(container.innerHTML).toBe("");
  });

  it("forgets the previous render", () => {
    const path = nix.load({ "default.nix": `{ render = state: "new"; }` });
    const container = document.createElement("div");
    nix.mount(container, path);
    nix.unmount(container);

    container.innerHTML = "<p>unmanaged</p>";
    nix.mount(container, path);
    const html = container.innerHTML;
    nix.unmount(container);
    nix.unload(path);

    expect(html).toBe("new");
  });

  it("throws if nothing is mounted", () => {
    expect(() => nix.unmount(document.createElement("div"))).toThrow(
      /Nothing is mounted/,
    );
  });
});
