/**
 * Vite plugin for apps written in Nix. It renders pages, and imports apps
 * from JS.
 *
 * Pages are HTML files the plugin renders, in dev on each request and in
 * builds as entries. Each names a server entry that renders the page, and a
 * client entry that runs in it:
 *
 * ```ts
 * cursery({
 *   pages: {
 *     "index.html": {
 *       entry: {
 *         server: "./document.nix",
 *         client: { type: "nix", path: "./app", effects: "./effects.ts" },
 *       },
 *     },
 *   },
 * });
 * ```
 *
 * Paths are relative to Vite's `root`, and stay inside it. See `Page` for
 * the entries.
 *
 * Apps import from JS with `?cursery:app`, given the app's directory:
 *
 * ```ts
 * import app from "./app?cursery:app";
 *
 * app.mount(document.getElementById("app")!);
 * ```
 *
 * An app is made of every `.nix` file in its directory and below. Editing
 * any of them hot reloads it, keeping state.
 *
 * `?cursery:source` loads the same files without mounting anything, giving
 * the path of the app's entry, for `mount` and `evaluate` from `cursery`:
 *
 * ```ts
 * import app from "./app?cursery:source";
 *
 * mount(document.getElementById("app")!, app);
 * ```
 */

import { statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import type { Plugin } from "vite";

import { settings } from "../vitest/settings.ts";
import { type Page, pages as readPages, render } from "./pages.ts";

export type { Client, Page } from "./pages.ts";

export interface Options {
  /** Pages to render, by their path in the output, e.g. `"a/index.html"`. */
  pages?: Record<string, Page>;
}

/**
 * Where the pages' generated client modules are served, by page, e.g.
 * `/@cursery/client/a/index.html.js`.
 */
const client = "/@cursery/client/";

export default function cursery(options: Options = {}): Plugin {
  let root = process.cwd();
  let pages = readPages(root, options.pages ?? {});

  /** The page at `file`, an absolute path in the output's layout. */
  const page = (file: string) =>
    pages.find((page) => resolve(root, page.name) === file);

  return {
    name: "cursery",
    enforce: "pre",

    config(config, { mode }) {
      root = resolve(config.root ?? "");
      pages = readPages(root, options.pages ?? {});

      // Vitest runs in mode "test", which builds no pages.
      if (mode === "test") return settings(config);
      if (pages.length === 0) return;

      // Pages are build entries, like HTML files in the root.
      const files = pages.map((page) => [page.name, resolve(root, page.name)]);
      const rolldown = ((config.build ??= {}).rolldownOptions ??= {});
      const input = rolldown.input;
      rolldown.input =
        input === undefined
          ? files.map(([, file]) => file!)
          : typeof input === "string" || Array.isArray(input)
            ? [...[input].flat(), ...files.map(([, file]) => file!)]
            : { ...input, ...Object.fromEntries(files) };
    },

    configureServer(server) {
      // Before Vite's own HTML handling, which would 404.
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url ?? "/", "http://localhost");
        const path = url.pathname.slice(server.config.base.length - 1);
        const match = pages.find((page) => routes(page.name).includes(path));
        if (!match) return next();

        server
          .transformIndexHtml(`/${match.name}`, render(root, match, client))
          .then((html) => {
            response.setHeader("Content-Type", "text/html");
            response.end(html);
          })
          .catch(next);
      });
    },

    handleHotUpdate({ file, modules, server }) {
      // Pages render on each request, so files only they use need a reload.
      if (file.endsWith(".nix") && modules.length === 0 && pages.length > 0) {
        server.ws.send({ type: "full-reload" });
      }
    },

    resolveId(source, importer) {
      if (page(source)) return source;
      if (source.startsWith(client)) return `\0${source}`;

      const [file = "", search = ""] = source.split("?");
      if (!kind(search)) return null;

      // Like Vite: root-relative, then absolute.
      const candidates = file.startsWith("/")
        ? [join(root, file), file]
        : [resolve(importer ? dirname(importer) : root, file)];

      for (const candidate of candidates) {
        const stats = statSync(candidate, { throwIfNoEntry: false });
        if (stats?.isDirectory())
          return `${join(candidate, "default.nix")}?${search}`;
        if (stats?.isFile()) return `${candidate}?${search}`;
      }

      return null;
    },

    load(id) {
      const found = page(id);
      if (found) return render(root, found, client);

      if (id.startsWith(`\0${client}`)) {
        const name = id.slice(client.length + 1, -".js".length);
        const match = pages.find((page) => page.name === name);
        if (match?.client.type !== "nix") return null;
        return mount(match.client.path, match.client.effects);
      }

      const [file = "", search = ""] = id.split("?");

      // Vite adds `import` to imports of unknown file types.
      switch (kind(search)) {
        case "app":
          return { code: entry(file), moduleType: "js" };
        case "source":
          return { code: sources(file), moduleType: "js" };
        default:
          return null;
      }
    },
  };
}

/** What `search`, a query string, imports: an app, its source, or neither. */
function kind(search: string) {
  const params = new URLSearchParams(search);
  if (params.has("cursery:app")) return "app";
  if (params.has("cursery:source")) return "source";
  return null;
}

/** URL paths that serve the page at `name`. */
function routes(name: string) {
  const index = /(^|\/)index\.html$/.exec(name);
  return index
    ? [`/${name}`, `/${name.slice(0, index.index)}${index[1]}`]
    : [`/${name}`];
}

/** The module mounting the app at `path` into its page, with `effects`. */
function mount(path: string, effects?: string) {
  const imports = [
    `import app from ${JSON.stringify(`/${path}?cursery:app`)};`,
  ];
  if (effects)
    imports.push(`import effects from ${JSON.stringify(`/${effects}`)};`);

  // Mounting again swaps in edited effects, keeping state.
  return `
${imports.join("\n")}

import.meta.hot?.accept();

app.mount(document.querySelector("[data-cursery-app]"), ${effects ? "{ effects }" : "{}"});
`;
}

/** The module standing in for the app at `file`. */
function entry(file: string) {
  const name = `./${basename(file)}`;

  // Vite tracks imported files as dependencies, re-running this module when
  // one changes. Accepting statically marks it as the update boundary.
  return `
import { app } from "cursery/vite-plugin/runtime";
import source from ${JSON.stringify(`${name}?raw`)};

// Globs skip the importing file, i.e. the entry.
const files = import.meta.glob("./**/*.nix", {
  query: "?raw",
  import: "default",
  eager: true,
});

import.meta.hot?.accept();

const entry = ${JSON.stringify(name)};
export default app({ ...files, [entry]: source }, entry, import.meta.hot);
`;
}

/**
 * The module loading the app at `file` into the store, exporting its
 * entry's path. Replacing it unloads the old files.
 */
function sources(file: string) {
  const name = basename(file);

  return `
import { load, unload } from "cursery";
import source from ${JSON.stringify(`./${name}?raw`)};

// Globs skip the importing file, i.e. the entry.
const files = import.meta.glob("./**/*.nix", {
  query: "?raw",
  import: "default",
  eager: true,
});

const path = load({ ...files, ${JSON.stringify(`./${name}`)}: source });
import.meta.hot?.dispose(() => unload(path));

export default \`\${path}/${name}\`;
`;
}
