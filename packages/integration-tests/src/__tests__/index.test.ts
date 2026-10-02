import * as nix from "nix-wasm";

describe("evaluate", () => {
  it("evaluates primitives", () => {
    expect(nix.evaluate("1 + 2")).toBe("3");
    expect(nix.evaluate('"hello" + " world"')).toBe('"hello world"');
  });

  it("strictly evaluates nested values", () => {
    expect(nix.evaluate("{ a = 1 + 1; b = [ (2 * 3) ]; }")).toBe(
      "{ a = 2; b = [ 6 ]; }",
    );
  });

  it("supports builtins", () => {
    expect(nix.evaluate("builtins.toJSON { a = [ true null ]; }")).toBe(
      '"{\\"a\\":[true,null]}"',
    );
  });

  it("throws on syntax errors", () => {
    expect(() => nix.evaluate("{")).toThrow();
  });

  it("throws on evaluation errors", () => {
    expect(() => nix.evaluate('throw "boom"')).toThrow(/boom/);
  });

  describe("bundled libraries", () => {
    it("resolves through the search path", () => {
      expect(nix.evaluate("builtins.attrNames (import <web>)")).toBe(
        '[ "dom" ]',
      );
    });

    it("throws on unknown libraries", () => {
      expect(() => nix.evaluate("import <web/missing>")).toThrow(/missing/);
    });

    it("only resolves the `web` prefix", () => {
      expect(() => nix.evaluate("import <public>")).toThrow(/public/);
    });
  });
});
