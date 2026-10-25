/**
 * Vitest plugin for testing apps, in Node or a simulated DOM like jsdom:
 *
 * ```ts
 * import cursery from "cursery/vitest";
 * import { defineConfig } from "vitest/config";
 *
 * export default defineConfig({
 *   plugins: [cursery()],
 *   test: { environment: "jsdom" },
 * });
 * ```
 *
 * Its settings merge into yours, so your own externals and setup files stay.
 */

import { join } from "node:path";
import type { Plugin, UserConfig } from "vite";

export default function cursery(): Plugin {
  return {
    name: "cursery:vitest",

    config() {
      return {
        test: {
          server: {
            deps: {
              // Loads the bindings untransformed. Vite rewrites their
              // `new URL(..., import.meta.url)` to an `http:` URL, which
              // Node can't read the `.wasm` file from.
              external: [/\/cursery\/dist\//],
            },
          },

          setupFiles: [join(import.meta.dirname, "setup.js")],
        },

        // Vitest's `test` isn't in Vite's types without it installed.
      } as UserConfig;
    },
  };
}
