import * as nix from "nix-wasm";

describe("mount", () => {
  const loaded: string[] = [];

  afterEach(() => {
    loaded.splice(0).forEach((path) => nix.unload(path));
  });

  /** Mounts an app with the given `default.nix` into a new container. */
  function mount(app: string): HTMLElement {
    const path = nix.load({
      "default.nix": `let inherit (import <web/dom>) element html; in ${app}`,
    });

    loaded.push(path);
    const container = document.createElement("div");
    nix.mount(container, path);

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
    nix.mount(container, `${path}/app`);

    expect(container.textContent).toBe("from view");
  });

  it("replaces existing content", () => {
    const container = document.createElement("div");
    container.innerHTML = "<p>old</p>";
    const path = nix.load({ "default.nix": `{ render = state: "new"; }` });
    loaded.push(path);

    nix.mount(container, path);

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
});
