import * as nix from "cursery";

/** Renders `code` with the DOM builders in scope, returning its HTML. */
function render(code: string): string {
  using app = load({
    "default.nix": `let inherit (import <web/dom>) element html text; in {
      render = state: ${code};
    }`,
  });

  const container = document.createElement("div");
  nix.mount(container, app.path);

  return container.innerHTML;
}

/** Loads `files`, unloading them once disposed. */
function load(files: Record<string, string>): Disposable & { path: string } {
  const path = nix.load(files);

  return { path, [Symbol.dispose]: () => nix.unload(path) };
}

describe("dom", () => {
  it("creates elements", () => {
    expect(render(`html.h1 { class = "title"; } "Hello"`)).toBe(
      '<h1 class="title">Hello</h1>',
    );
  });

  it("creates custom elements", () => {
    expect(render(`element "my-widget"`)).toBe("<my-widget></my-widget>");
  });

  it("creates text nodes", () => {
    expect(render(`text "<b>not bold</b>"`)).toBe(
      "&lt;b&gt;not bold&lt;/b&gt;",
    );
  });

  it("nests elements", () => {
    expect(render(`html.ul [ (html.li "a") html.br ]`)).toBe(
      "<ul><li>a</li><br></ul>",
    );
  });

  it("flattens nested lists of children", () => {
    expect(
      render(`html.p [ "a" [ "b" [ "c" ] ] (map toString [ 1 2 ]) ]`),
    ).toBe("<p>abc12</p>");
  });

  it("skips null and booleans", () => {
    expect(render(`html.p [ null true false "kept" ]`)).toBe("<p>kept</p>");
  });

  it("renders numbers as text", () => {
    expect(render(`html.p [ 42 " " 1.5 ]`)).toBe("<p>42 1.5</p>");
  });

  it("does not render `key`", () => {
    expect(render(`html.li { key = "a"; id = "x"; }`)).toBe('<li id="x"></li>');
  });

  it("merges repeated attrs", () => {
    expect(
      render(`html.p { id = "a"; class = "x"; } { class = "y"; key = 1; }`),
    ).toBe('<p class="y" id="a"></p>');
  });

  it("appends repeated children", () => {
    expect(render(`html.p "a" [ "b" ] "c"`)).toBe("<p>abc</p>");
  });

  it("converts attribute values to strings", () => {
    expect(
      render(`html.input {
        type = "number";
        min = 1;
        step = 0.5;
        required = true;
        disabled = false;
        placeholder = null;
      }`),
    ).toBe('<input min="1" required="" step="0.5" type="number">');
  });

  it("lets later attrs unset earlier ones", () => {
    expect(
      render(`html.input { disabled = true; } { disabled = false; }`),
    ).toBe("<input>");
  });

  it("rejects other attribute values", () => {
    expect(() => render(`html.p { a = [ ]; }`)).toThrow(
      /Invalid attribute \W*a\W* of type list/,
    );
  });

  it("rejects invalid children", () => {
    expect(() => render(`html.p [ { a = 1; } ]`)).toThrow(/Invalid child/);
    expect(() => render(`html.p (x: x)`)).toThrow(/Invalid child/);
  });
});
