import * as nix from "nix-wasm";

describe("evaluate", () => {
  it("strictly evaluates nested values", () => {
    expect(nix.evaluate("{ a = 1 + 1; b = [ (2 * 3) ]; }")).toEqual({
      a: 2,
      b: [6],
    });
  });

  it("supports builtins", () => {
    expect(nix.evaluate(`builtins.toJSON { a = [ true null ]; }`)).toBe(
      '{"a":[true,null]}',
    );
  });

  it("throws on syntax errors", () => {
    expect(() => nix.evaluate("{")).toThrow();
  });

  it("throws on evaluation errors", () => {
    expect(() => nix.evaluate('throw "boom"')).toThrow(/boom/);
  });

  describe("conversion", () => {
    it("converts primitives", () => {
      expect(nix.evaluate("null")).toBe(null);
      expect(nix.evaluate("true")).toBe(true);
      expect(nix.evaluate("1 + 2")).toBe(3);
      expect(nix.evaluate("1.5")).toBe(1.5);
      expect(nix.evaluate(`"hello" + " world"`)).toBe("hello world");
      expect(nix.evaluate("/a/b")).toBe("/a/b");
    });

    it("converts attrs to objects without a prototype", () => {
      const value = nix.evaluate(`{ __proto__ = 1; toString = 2; }`);

      expect(Object.getPrototypeOf(value)).toBe(null);
      expect(Object.entries(value as object)).toEqual([
        ["__proto__", 1],
        ["toString", 2],
      ]);
    });

    it("preserves sharing", () => {
      const [a, b] = nix.evaluate("let x = { a = 1; }; in [ x x ]") as [
        unknown,
        unknown,
      ];

      expect(a).toBe(b);
    });

    it("handles cycles", () => {
      const attrs = nix.evaluate("let x = { self = x; }; in x") as {
        self: unknown;
      };

      const list = nix.evaluate("(rec { f = [ f ]; }).f") as unknown[];

      expect(attrs.self).toBe(attrs);
      expect(list[0]).toBe(list);
    });

    it("converts integers up to 2^53", () => {
      expect(nix.evaluate("9007199254740991")).toBe(Number.MAX_SAFE_INTEGER);
      expect(nix.evaluate("-9007199254740991")).toBe(Number.MIN_SAFE_INTEGER);
      expect(() => nix.evaluate("9007199254740992")).toThrow(/precision/);
    });

    it("rejects functions", () => {
      expect(() => nix.evaluate("x: x")).toThrow(/lambda/);
      expect(() => nix.evaluate("[ builtins.map ]")).toThrow(/lambda/);
    });
  });

  describe("bundled libraries", () => {
    it("resolves through the search path", () => {
      expect(nix.evaluate("builtins.attrNames (import <web>)")).toEqual([
        "dom",
      ]);
    });

    it("throws on unknown libraries", () => {
      expect(() => nix.evaluate("import <web/missing>")).toThrow(/missing/);
    });

    it("only resolves the `web` prefix", () => {
      expect(() => nix.evaluate("import <public>")).toThrow(/public/);
    });
  });
});
