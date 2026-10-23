import * as cursery from "cursery";

import { load, nix } from "../testing.ts";

describe("store", () => {
  it("imports loaded files", () => {
    using app = load({ "main.nix": nix`1 + 1` });

    expect(cursery.evaluate(nix`import ${app.path}/main.nix`)).toBe(2);
  });

  it("imports relative to the importing file", () => {
    using app = load({
      "./main.nix": nix`import ./views`,
      "./views/default.nix": nix`import ./home.nix`,
      "./views/home.nix": nix`42`,
    });

    expect(cursery.evaluate(nix`import ${app.path}/main.nix`)).toBe(42);
  });

  it("lets loaded files use bundled libraries", () => {
    using app = load({ "main.nix": nix`builtins.attrNames (import <web>)` });

    expect(cursery.evaluate(nix`import ${app.path}/main.nix`)).toEqual([
      "dom",
      "io",
      "server",
      "style",
    ]);
  });

  it("matches the store paths Nix computes", () => {
    // From `builtins.path { path = ...; name = "source"; }` over the same files.
    using app = load({
      "main.nix": nix`1`,
      "a.nix": nix`x`,
      "a/b.nix": nix`nested`,
      "views/default.nix": nix`12345678`,
      "views/deep/empty.nix": "",
    });

    expect(app.path).toBe("/nix/store/sf59v5wn0wryk29kvx93y9vp2s45z0kh-source");
  });

  it("addresses chunks by content", () => {
    using a = load({ "main.nix": nix`1` });
    using b = load({ "./main.nix": nix`1` });
    using c = load({ "main.nix": nix`2` });
    using d = load({ "other.nix": nix`1` });

    expect(b.path).toBe(a.path);
    expect(c.path).not.toBe(a.path);
    expect(d.path).not.toBe(a.path);
  });

  it("keeps chunks independent", () => {
    const a = cursery.load({ "main.nix": nix`"a"` });
    using b = load({ "main.nix": nix`"b"` });
    cursery.unload(a);

    expect(() => cursery.evaluate(nix`import ${a}/main.nix`)).toThrow();
    expect(cursery.evaluate(nix`import ${b.path}/main.nix`)).toBe("b");
  });

  it("unloads once every load is released", () => {
    const first = cursery.load({ "main.nix": nix`1` });
    const second = cursery.load({ "main.nix": nix`1` });

    cursery.unload(first);
    expect(cursery.evaluate(nix`import ${second}/main.nix`)).toBe(1);

    cursery.unload(second);
    expect(() => cursery.evaluate(nix`import ${second}/main.nix`)).toThrow();
  });

  it("throws when unloading paths that aren't loaded", () => {
    const path = cursery.load({ "main.nix": nix`1` });
    cursery.unload(path);

    expect(() => cursery.unload(path)).toThrow(/Not loaded/);
    expect(() => cursery.unload("nonsense")).toThrow(/Not loaded/);
  });

  it("rejects paths outside the chunk", () => {
    expect(() => cursery.load({ "../a.nix": nix`1` })).toThrow(
      /Invalid file path/,
    );
    expect(() => cursery.load({ "/a.nix": nix`1` })).toThrow(
      /Invalid file path/,
    );
    expect(() => cursery.load({ ".": nix`1` })).toThrow(/Invalid file path/);
  });

  it("rejects non-string contents", () => {
    const files = { "main.nix": 1 } as unknown as Record<string, string>;
    expect(() => cursery.load(files)).toThrow(/Invalid files/);
  });
});
