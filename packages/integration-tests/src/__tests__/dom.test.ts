import * as nix from "nix-wasm";

/** Evaluates `code` with the DOM builders in scope and returns it as JSON. */
function render(code: string): unknown {
  // The root keeps its functor, which `toJSON` can't serialize.
  const source = nix.evaluate(
    `builtins.toJSON (builtins.removeAttrs (let inherit (import <web/dom>) element html; in ${code}) [ "__functor" ])`,
  );

  // `evaluate` renders the JSON as a Nix string literal, whose escapes match
  // JSON's for everything these tests produce.
  return JSON.parse(JSON.parse(source) as string);
}

describe("dom", () => {
  it("creates elements", () => {
    expect(render(`html.h1 { class = "title"; } "Hello"`)).toEqual({
      _type: "element",
      tag: "h1",
      key: null,
      attrs: { class: "title" },
      children: [{ _type: "text", text: "Hello" }],
    });
  });

  it("creates custom elements", () => {
    expect(render(`element "my-widget"`)).toMatchObject({ tag: "my-widget" });
  });

  it("nests elements", () => {
    expect(render(`html.ul [ (html.li "a") html.br ]`)).toEqual({
      _type: "element",
      tag: "ul",
      key: null,
      attrs: {},
      children: [
        {
          _type: "element",
          tag: "li",
          key: null,
          attrs: {},
          children: [{ _type: "text", text: "a" }],
        },
        { _type: "element", tag: "br", key: null, attrs: {}, children: [] },
      ],
    });
  });

  it("flattens nested lists of children", () => {
    expect(
      render(`html.p [ "a" [ "b" [ "c" ] ] (map toString [ 1 2 ]) ]`),
    ).toMatchObject({
      children: [
        { text: "a" },
        { text: "b" },
        { text: "c" },
        { text: "1" },
        { text: "2" },
      ],
    });
  });

  it("skips null and booleans", () => {
    expect(render(`html.p [ null true false "kept" ]`)).toMatchObject({
      children: [{ text: "kept" }],
    });
  });

  it("renders numbers as text", () => {
    expect(render(`html.p [ 42 1.5 ]`)).toMatchObject({
      children: [{ text: "42" }, { text: "1.5" }],
    });
  });

  it("lifts `key` out of attrs", () => {
    expect(render(`html.li { key = "a"; id = "x"; }`)).toMatchObject({
      key: "a",
      attrs: { id: "x" },
    });
  });

  it("merges repeated attrs", () => {
    expect(
      render(`html.p { id = "a"; class = "x"; } { class = "y"; key = 1; }`),
    ).toMatchObject({ key: 1, attrs: { id: "a", class: "y" } });
  });

  it("appends repeated children", () => {
    expect(render(`html.p "a" [ "b" ] "c"`)).toMatchObject({
      children: [{ text: "a" }, { text: "b" }, { text: "c" }],
    });
  });

  it("rejects invalid children", () => {
    expect(() => render(`html.p [ { a = 1; } ]`)).toThrow(/Invalid child/);
    expect(() => render(`html.p (x: x)`)).toThrow(/Invalid child/);
  });
});
