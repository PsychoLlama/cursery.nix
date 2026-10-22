/**
 * Vite plugin that turns imported `.nix` files into apps:
 *
 * ```ts
 * import app from "./default.nix";
 *
 * app.mount(document.getElementById("app")!);
 * ```
 *
 * An app is made of every `.nix` file in the entry's directory and below.
 * Editing any of them hot reloads it, keeping state.
 */

import type { Plugin } from "vite";

export default function cursery(): Plugin {
  return {
    name: "cursery",
    enforce: "pre",

    load(id) {
      const [file = "", query = ""] = id.split("?");

      // Other queries, e.g. the `?raw` imports below, ask for something else.
      // Dev adds `?import` to imports of unknown file types.
      if (!file.endsWith(".nix") || !["", "import"].includes(query)) {
        return null;
      }

      return { code: entry(file), moduleType: "js" };
    },
  };
}

/** The module standing in for the app at `file`. */
function entry(file: string) {
  const name = `./${file.split("/").pop()}`;

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
