import * as nix from "nix-wasm";

describe("store", () => {
  it("imports loaded files", () => {
    const app = nix.load({ "main.nix": "1 + 1" });

    expect(nix.evaluate(`import ${app}/main.nix`)).toBe("2");
    nix.unload(app);
  });

  it("imports relative to the importing file", () => {
    const app = nix.load({
      "./main.nix": "import ./views",
      "./views/default.nix": "import ./home.nix",
      "./views/home.nix": "42",
    });

    expect(nix.evaluate(`import ${app}/main.nix`)).toBe("42");
    nix.unload(app);
  });

  it("lets loaded files use bundled libraries", () => {
    const app = nix.load({ "main.nix": "builtins.attrNames (import <web>)" });

    expect(nix.evaluate(`import ${app}/main.nix`)).toBe('[ "dom" ]');
    nix.unload(app);
  });

  it("matches the store paths Nix computes", () => {
    // From `builtins.path { path = ...; name = "source"; }` over the same files.
    const app = nix.load({
      "main.nix": "1",
      "a.nix": "x",
      "a/b.nix": "nested",
      "views/default.nix": "12345678",
      "views/deep/empty.nix": "",
    });

    expect(app).toBe("/nix/store/sf59v5wn0wryk29kvx93y9vp2s45z0kh-source");
    nix.unload(app);
  });

  it("addresses chunks by content", () => {
    const a = nix.load({ "main.nix": "1" });
    const b = nix.load({ "./main.nix": "1" });
    const c = nix.load({ "main.nix": "2" });
    const d = nix.load({ "other.nix": "1" });

    expect(b).toBe(a);
    expect(c).not.toBe(a);
    expect(d).not.toBe(a);
    [a, b, c, d].forEach((path) => nix.unload(path));
  });

  it("keeps chunks independent", () => {
    const a = nix.load({ "main.nix": `"a"` });
    const b = nix.load({ "main.nix": `"b"` });
    nix.unload(a);

    expect(() => nix.evaluate(`import ${a}/main.nix`)).toThrow();
    expect(nix.evaluate(`import ${b}/main.nix`)).toBe('"b"');
    nix.unload(b);
  });

  it("unloads once every load is released", () => {
    const first = nix.load({ "main.nix": "1" });
    const second = nix.load({ "main.nix": "1" });

    nix.unload(first);
    expect(nix.evaluate(`import ${second}/main.nix`)).toBe("1");

    nix.unload(second);
    expect(() => nix.evaluate(`import ${second}/main.nix`)).toThrow();
  });

  it("throws when unloading paths that aren't loaded", () => {
    const app = nix.load({ "main.nix": "1" });
    nix.unload(app);

    expect(() => nix.unload(app)).toThrow(/Not loaded/);
    expect(() => nix.unload("nonsense")).toThrow(/Not loaded/);
  });

  it("rejects paths outside the chunk", () => {
    expect(() => nix.load({ "../a.nix": "1" })).toThrow(/Invalid file path/);
    expect(() => nix.load({ "/a.nix": "1" })).toThrow(/Invalid file path/);
    expect(() => nix.load({ ".": "1" })).toThrow(/Invalid file path/);
  });

  it("rejects non-string contents", () => {
    const files = { "main.nix": 1 } as unknown as Record<string, string>;
    expect(() => nix.load(files)).toThrow(/Invalid files/);
  });
});
