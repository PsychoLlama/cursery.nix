import { load, mount, nix } from "../testing.ts";

/** Renders `code` with the DOM builders in scope, returning its HTML. */
function render(code: string): string {
  using app = load({
    "default.nix": nix`let inherit (import <web/dom>) element html svg text; in {
      render = state: ${code};
    }`,
  });

  using view = mount(app.path);
  return view.container.innerHTML;
}

describe("dom", () => {
  it("creates elements", () => {
    expect(render(nix`html.h1 { class = "title"; } "Hello"`)).toBe(
      '<h1 class="title">Hello</h1>',
    );
  });

  it("creates custom elements", () => {
    expect(render(nix`element "my-widget"`)).toBe("<my-widget></my-widget>");
  });

  it("creates text nodes", () => {
    expect(render(nix`text "<b>not bold</b>"`)).toBe(
      "&lt;b&gt;not bold&lt;/b&gt;",
    );
  });

  it("nests elements", () => {
    expect(render(nix`html.ul [ (html.li "a") html.br ]`)).toBe(
      "<ul><li>a</li><br></ul>",
    );
  });

  it("flattens nested lists of children", () => {
    expect(
      render(nix`html.p [ "a" [ "b" [ "c" ] ] (map toString [ 1 2 ]) ]`),
    ).toBe("<p>abc12</p>");
  });

  it("skips null and booleans", () => {
    expect(render(nix`html.p [ null true false "kept" ]`)).toBe("<p>kept</p>");
  });

  it("renders numbers as text", () => {
    expect(render(nix`html.p [ 42 " " 1.5 ]`)).toBe("<p>42 1.5</p>");
  });

  it("does not render `key`", () => {
    expect(render(nix`html.li { key = "a"; id = "x"; }`)).toBe(
      '<li id="x"></li>',
    );
  });

  it("merges repeated attrs", () => {
    expect(
      render(nix`html.p { id = "a"; class = "x"; } { class = "y"; key = 1; }`),
    ).toBe('<p class="y" id="a"></p>');
  });

  it("appends repeated children", () => {
    expect(render(nix`html.p "a" [ "b" ] "c"`)).toBe("<p>abc</p>");
  });

  it("converts attribute values to strings", () => {
    expect(
      render(nix`html.input {
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
      render(nix`html.input { disabled = true; } { disabled = false; }`),
    ).toBe("<input>");
  });

  it("joins lists of classes", () => {
    expect(
      render(
        nix`html.p { class = [ "a" [ "b" null ] (if false then "c" else null) ]; }`,
      ),
    ).toBe('<p class="a b"></p>');
  });

  it("omits empty lists of classes", () => {
    expect(render(nix`html.p { class = [ null ]; }`)).toBe("<p></p>");
  });

  it("rejects invalid classes", () => {
    expect(() => render(nix`html.p { class = [ 1 ]; }`)).toThrow(
      /Invalid class of type int/,
    );
  });

  it("rejects invalid keys", () => {
    expect(() => render(nix`html.li { key = 1.5; }`)).toThrow(
      /Invalid key of type float/,
    );
  });

  it("rejects other attribute values", () => {
    expect(() => render(nix`html.p { a = [ ]; }`)).toThrow(
      /Invalid attribute \W*a\W* of type list/,
    );
  });

  it("creates SVG elements", () => {
    expect(
      render(
        nix`svg.svg { viewBox = "0 0 10 10"; } (svg.circle { cx = 5; r = 5; })`,
      ),
    ).toBe('<svg viewBox="0 0 10 10"><circle cx="5" r="5"></circle></svg>');
  });

  it("creates SVG elements in the SVG namespace", () => {
    using app = load({
      "default.nix": nix`let inherit (import <web/dom>) html svg; in {
        render = state: [ (html.a "html") (svg.svg (svg.a "svg")) ];
      }`,
    });
    using view = mount(app.path);

    const [html, svg] = view.container.querySelectorAll("a");
    expect(html!.namespaceURI).toBe("http://www.w3.org/1999/xhtml");
    expect(svg!.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(view.container.querySelector("svg")!.namespaceURI).toBe(
      "http://www.w3.org/2000/svg",
    );
  });

  it("rejects invalid children", () => {
    expect(() => render(nix`html.p [ { a = 1; } ]`)).toThrow(/Invalid child/);
    expect(() => render(nix`html.p (x: x)`)).toThrow(/Invalid child/);
  });
});
