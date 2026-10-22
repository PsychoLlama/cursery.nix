import * as cursery from "cursery";

import { nix } from "../testing.ts";

describe("evaluate", () => {
  it("strictly evaluates nested values", () => {
    expect(cursery.evaluate(nix`{ a = 1 + 1; b = [ (2 * 3) ]; }`)).toEqual({
      a: 2,
      b: [6],
    });
  });

  it("supports builtins", () => {
    expect(cursery.evaluate(nix`builtins.toJSON { a = [ true null ]; }`)).toBe(
      '{"a":[true,null]}',
    );
  });

  it("throws on syntax errors", () => {
    expect(() => cursery.evaluate(nix`{`)).toThrow();
  });

  it("throws on evaluation errors", () => {
    expect(() => cursery.evaluate(nix`throw "boom"`)).toThrow(/boom/);
  });

  describe("conversion", () => {
    it("converts primitives", () => {
      expect(cursery.evaluate(nix`null`)).toBe(null);
      expect(cursery.evaluate(nix`true`)).toBe(true);
      expect(cursery.evaluate(nix`1 + 2`)).toBe(3);
      expect(cursery.evaluate(nix`1.5`)).toBe(1.5);
      expect(cursery.evaluate(nix`"hello" + " world"`)).toBe("hello world");
      expect(cursery.evaluate(nix`/a/b`)).toBe("/a/b");
    });

    it("converts attrs to objects without a prototype", () => {
      const value = cursery.evaluate(nix`{ __proto__ = 1; toString = 2; }`);

      expect(Object.getPrototypeOf(value)).toBe(null);
      expect(Object.entries(value as object)).toEqual([
        ["__proto__", 1],
        ["toString", 2],
      ]);
    });

    it("preserves sharing", () => {
      const [a, b] = cursery.evaluate(nix`let x = { a = 1; }; in [ x x ]`) as [
        unknown,
        unknown,
      ];

      expect(a).toBe(b);
    });

    it("handles cycles", () => {
      const attrs = cursery.evaluate(nix`let x = { self = x; }; in x`) as {
        self: unknown;
      };

      const list = cursery.evaluate(nix`(rec { f = [ f ]; }).f`) as unknown[];

      expect(attrs.self).toBe(attrs);
      expect(list[0]).toBe(list);
    });

    it("converts integers up to 2^53", () => {
      expect(cursery.evaluate(nix`9007199254740991`)).toBe(
        Number.MAX_SAFE_INTEGER,
      );
      expect(cursery.evaluate(nix`-9007199254740991`)).toBe(
        Number.MIN_SAFE_INTEGER,
      );
      expect(() => cursery.evaluate(nix`9007199254740992`)).toThrow(
        /precision/,
      );
    });

    it("rejects functions", () => {
      expect(() => cursery.evaluate(nix`x: x`)).toThrow(/lambda/);
      expect(() => cursery.evaluate(nix`[ builtins.map ]`)).toThrow(/lambda/);
    });
  });

  describe("bundled libraries", () => {
    it("resolves through the search path", () => {
      expect(cursery.evaluate(nix`builtins.attrNames (import <web>)`)).toEqual([
        "dom",
        "style",
      ]);
    });

    it("throws on unknown libraries", () => {
      expect(() => cursery.evaluate(nix`import <web/missing>`)).toThrow(
        /missing/,
      );
    });

    it("only resolves the `web` prefix", () => {
      expect(() => cursery.evaluate(nix`import <public>`)).toThrow(/public/);
    });
  });
});
