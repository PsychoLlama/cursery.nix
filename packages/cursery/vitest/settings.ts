/**
 * The Vitest settings for loading apps, shared by both plugins.
 */

import type { UserConfig } from "vite";

const setup = "cursery/testing/setup";

/** Settings to merge into `config`, unless another plugin already has. */
export function settings(config: UserConfig): UserConfig | undefined {
  // Vitest's `test` isn't in Vite's types without it installed.
  const test = (config as { test?: { setupFiles?: string | string[] } }).test;
  if ([test?.setupFiles ?? []].flat().includes(setup)) return;

  return {
    test: {
      server: {
        deps: {
          // Loads the bindings untransformed. Vite rewrites their
          // `new URL(..., import.meta.url)` to an `http:` URL, which Node
          // can't read the `.wasm` file from.
          external: [/\/cursery\/dist\//],
        },
      },

      setupFiles: [setup],
    },
  } as UserConfig;
}
