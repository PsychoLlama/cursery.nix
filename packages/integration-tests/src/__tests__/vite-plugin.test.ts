// @vitest-environment node

import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import cursery, { type Client, type Options } from "cursery/vite-plugin";
import { build, createServer, type InlineConfig } from "vite";

import { nix } from "../testing.ts";

/** A project of `files` in a new directory, removed once disposed. */
function project(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "cursery-vite-"));
  // Generated modules import the plugin's runtime.
  symlinkSync(
    join(import.meta.dirname, "../../node_modules"),
    join(root, "node_modules"),
  );

  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), contents);
  }

  return { root, [Symbol.dispose]: () => rmSync(root, { recursive: true }) };
}

/** Vite's config for `root`, with the plugin given `options`. */
const config = (root: string, options: Options): InlineConfig => ({
  root,
  configFile: false,
  logLevel: "silent",
  plugins: [cursery(options)],
});

/** Builds `root`, returning the text of each output file by name. */
async function bundle(root: string, options: Options) {
  const result = await build({
    ...config(root, options),
    build: { write: false },
  });
  const { output } = result as {
    output: { fileName: string; code?: string; source?: unknown }[];
  };

  return Object.fromEntries(
    output.map((file) => [file.fileName, file.code ?? String(file.source)]),
  );
}

/** Serves `root` in dev, closing the server once disposed. */
async function serve(root: string, options: Options) {
  const server = await createServer({
    ...config(root, options),
    server: { port: 0, ws: false },
    optimizeDeps: { noDiscovery: true },
  });
  await server.listen();
  const base = server.resolvedUrls!.local[0]!;

  return {
    server,
    fetch: (path: string) => fetch(new URL(path, base)),
    [Symbol.asyncDispose]: () => server.close(),
  };
}

/** A server entry placing each input in a minimal page. */
const document = nix`{ children, assets, scripts }:
  let inherit (import <web/dom>) html; in
  html.html [ (html.head assets) (html.body [ children scripts ]) ]`;

const app = nix`let inherit (import <web/dom>) html; inherit (import <web/style>) css; in {
  render = _: html.p { class = css "color: teal;"; } "from the app";
}`;

/** Pages at `index.html` with a `document` server entry and `client`. */
const page = (client: Client): Options => ({
  pages: { "index.html": { entry: { server: "./document.nix", client } } },
});

describe("build", () => {
  it("renders static pages", async () => {
    using files = project({ "document.nix": document });

    expect(
      (await bundle(files.root, page({ type: "static" })))["index.html"],
    ).toBe("<!doctype html><html><head></head><body></body></html>");
  });

  it("renders the app of nix clients, and mounts it", async () => {
    using files = project({
      "document.nix": document,
      "app/default.nix": app,
      "effects.ts": `export default { marker: () => "effects-marker" };`,
    });

    const output = await bundle(
      files.root,
      page({ type: "nix", path: "./app", effects: "./effects.ts" }),
    );
    const html = output["index.html"]!;
    const [, script] = /<script type="module" crossorigin src="\/(.+?)">/.exec(
      html,
    )!;

    expect(html).toMatch(
      /<head><style>@layer components\{\.s-\w+\{color:teal\}\}<\/style>/,
    );
    expect(html).toContain('<body><div data-cursery-app=""><p class="s-');
    expect(html).toContain('">from the app</p></div></body>');
    expect(output[script!]).toContain("data-cursery-app");
    expect(output[script!]).toContain("effects-marker");
  });

  it("bundles manual clients", async () => {
    using files = project({
      "document.nix": document,
      "app/default.nix": app,
      "main.ts": `import app from "./app?cursery:app"; app.mount(document.body);`,
    });

    const output = await bundle(
      files.root,
      page({ type: "manual", path: "./main.ts" }),
    );
    const html = output["index.html"]!;
    const [, script] = /<script type="module" crossorigin src="\/(.+?)">/.exec(
      html,
    )!;

    expect(html).toContain("<body></body>");
    expect(Object.values(output).join()).toContain("from the app");
    expect(output[script!]).toContain("document.body");
  });

  it("renders every page", async () => {
    using files = project({
      "a.nix": nix`_: (import <web/dom>).html.html "a"`,
      "b/page.nix": nix`_: (import <web/dom>).html.html "b"`,
    });

    const output = await bundle(files.root, {
      pages: {
        "index.html": {
          entry: { server: "./a.nix", client: { type: "static" } },
        },
        "b/index.html": {
          entry: { server: "./b/page.nix", client: { type: "static" } },
        },
      },
    });

    expect(output["index.html"]).toBe("<!doctype html><html>a</html>");
    expect(output["b/index.html"]).toBe("<!doctype html><html>b</html>");
  });

  it("keeps other entries", async () => {
    using files = project({
      "document.nix": document,
      "other.html": "<p>other</p>",
    });

    const output = await build({
      ...config(files.root, page({ type: "static" })),
      build: {
        write: false,
        rolldownOptions: { input: join(files.root, "other.html") },
      },
    });
    const names = (output as { output: { fileName: string }[] }).output.map(
      (file) => file.fileName,
    );

    expect(names).toEqual(expect.arrayContaining(["index.html", "other.html"]));
  });
});

describe("dev", () => {
  it("serves pages at their routes", async () => {
    using files = project({ "document.nix": document, "app/default.nix": app });
    await using dev = await serve(files.root, {
      pages: {
        "a/index.html": {
          entry: {
            server: "./document.nix",
            client: { type: "nix", path: "./app" },
          },
        },
      },
    });

    for (const route of ["/a/", "/a/index.html"]) {
      const response = await dev.fetch(route);
      const html = await response.text();

      expect(response.headers.get("content-type")).toBe("text/html");
      expect(html).toContain(
        '<script type="module" src="/@vite/client"></script>',
      );
      expect(html).toContain("from the app</p></div>");
      expect(html).toContain(
        '<script src="/@cursery/client/a/index.html.js" type="module"></script>',
      );
    }
  });

  it("serves the client module", async () => {
    using files = project({
      "document.nix": document,
      "app/default.nix": app,
      "effects.ts": "export default {};",
    });
    await using dev = await serve(
      files.root,
      page({ type: "nix", path: "./app", effects: "./effects.ts" }),
    );

    const code = await (
      await dev.fetch("/@cursery/client/index.html.js")
    ).text();

    expect(code).toMatch(/from "\/app\/default\.nix\?(import&)?cursery:app"/);
    expect(code).toContain('from "/effects.ts"');
    expect(code).toContain('document.querySelector("[data-cursery-app]")');
  });

  it("imports apps by directory", async () => {
    using files = project({ "app/default.nix": app, "main.ts": "" });
    await using dev = await serve(files.root, {});

    const result = await dev.server.transformRequest("/app?cursery:app");

    expect(result?.code).toMatch(/cursery\/dist\/vite-plugin\/runtime\.js"/);
    expect(result?.code).toContain('from "/app/default.nix?import&raw"');
  });

  it("loads app sources by directory", async () => {
    using files = project({
      "app/default.nix": nix`import ./view.nix`,
      "app/view.nix": nix`"from the view"`,
    });
    await using dev = await serve(files.root, {});

    const { default: path } = await dev.server.ssrLoadModule(
      "/app?cursery:source",
    );
    // Vite imports the project's copy, with a store of its own.
    const { evaluate } = await dev.server.ssrLoadModule("cursery");

    expect(path).toMatch(/^\/nix\/store\/\w+-source\/default\.nix$/);
    expect(evaluate(`import ${path}`)).toBe("from the view");
  });

  it("reports pages that fail to render", async () => {
    using files = project({ "document.nix": nix`_: throw "boom"` });
    await using dev = await serve(files.root, page({ type: "static" }));

    const response = await dev.fetch("/");

    expect(response.status).toBe(500);
  });
});

describe("options", () => {
  it("rejects unknown client types", () => {
    expect(() => cursery(page({ type: "nope" } as never))).toThrow(
      /Invalid client type "nope" for page "index.html"/,
    );
  });

  it("rejects paths outside the root", () => {
    expect(() =>
      cursery({
        pages: {
          "index.html": {
            entry: { server: "../document.nix", client: { type: "static" } },
          },
        },
      }),
    ).toThrow(/Invalid path "..\/document.nix" for page "index.html"/);
  });
});
