/**
 * Renders pages for the plugin (see `index.ts`), in Node.
 */

import { globSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

import { load, renderToString, unload } from "cursery";

/** A page the plugin renders. */
export interface Page {
  entry: {
    /**
     * Renders the page: a Nix function of `{ children, assets, scripts }`,
     * returning an `html` element. Place each where it goes:
     *
     * ```nix
     * { children, assets, scripts }:
     * let inherit (import <web/dom>) html; in
     * html.html { lang = "en"; } [
     *   (html.head assets)
     *   (html.body [ children scripts ])
     * ]
     * ```
     *
     * `children` is the app rendered as it first mounts, in the element it
     * mounts into. `assets` are what it needs in the head, like its styles,
     * and `scripts` run the client. Each is empty if the client doesn't use
     * it.
     */
    server: string;

    /** What runs in the browser. */
    client: Client;
  };
}

/**
 * - `nix`: the app at `path`, a directory with a `default.nix`, rendered
 *   into `children` and mounted over it with `effects`, the default export
 *   of a module.
 * - `manual`: a module at `path`, in `scripts`. It mounts apps itself.
 * - `static`: nothing. The page is HTML only.
 */
export type Client =
  | { type: "nix"; path: string; effects?: string }
  | { type: "manual"; path: string }
  | { type: "static" };

/** A page, named by its path in the output, with paths relative to root. */
export interface Resolved {
  name: string;
  server: string;
  client: Client;
}

/** Validates `pages`, making paths relative to `root`. */
export function pages(root: string, pages: Record<string, Page>): Resolved[] {
  return Object.entries(pages).map(([name, page]) => {
    const { server, client } = page.entry;
    const inside = (path: string) => within(root, path, name);

    switch (client.type) {
      case "nix":
        return {
          name,
          server: inside(server),
          client: {
            type: "nix",
            path: inside(client.path),
            ...(client.effects && { effects: inside(client.effects) }),
          },
        };
      case "manual":
        return {
          name,
          server: inside(server),
          client: { type: "manual", path: inside(client.path) },
        };
      case "static":
        return { name, server: inside(server), client };
      default:
        throw new Error(
          `Invalid client type ${JSON.stringify((client as { type: unknown }).type)} for page ${JSON.stringify(name)}: expected "nix", "manual", or "static"`,
        );
    }
  });
}

/** `path` relative to `root`, which it must be inside. */
function within(root: string, path: string, page: string) {
  const inside = relative(root, resolve(root, path));
  if (inside.startsWith("..") || isAbsolute(inside)) {
    throw new Error(
      `Invalid path ${JSON.stringify(path)} for page ${JSON.stringify(page)}: it must be inside the root, ${root}`,
    );
  }

  return inside;
}

/**
 * Renders `page` to HTML. A `nix` client loads from `client`, a URL prefix
 * for its generated module.
 */
export function render(root: string, page: Resolved, client: string): string {
  const files: Record<string, string> = {};
  for (const file of globSync("**/*.nix", {
    cwd: root,
    exclude: ["**/node_modules"],
  })) {
    files[file] = readFileSync(resolve(root, file), "utf8");
  }

  const store = load(files);
  const wrapper = load({ "default.nix": WRAPPER });

  try {
    return renderToString(wrapper, {
      server: `${store}/${page.server}`,

      client:
        page.client.type === "nix" ? `${store}/${page.client.path}` : null,

      script:
        page.client.type === "nix"
          ? `${client}${page.name}.js`
          : page.client.type === "manual"
            ? `/${page.client.path}`
            : null,
    });
  } finally {
    unload(wrapper);
    unload(store);
  }
}

/** Gives the server entry its inputs, rendering a `nix` client's app. */
const WRAPPER = `{ server, client, script }:
let
  inherit (import <web/dom>) html;
  app = (import <web/static>).render (import client);
  scripts = if script == null then [ ] else [ (html.script { type = "module"; src = script; }) ];
in
import server (
  if client == null then
    {
      children = [ ];
      assets = [ ];
      inherit scripts;
    }
  else
    {
      children = [ (html.div { data-cursery-app = true; } app.children) ];
      assets = if app.styles == "" then [ ] else [ (html.style app.styles) ];
      inherit scripts;
    }
)
`;
