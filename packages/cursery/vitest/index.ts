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
 * The Vite plugin applies the same settings in Vitest, so this is only
 * needed without it.
 */

import type { Plugin } from "vite";

import { settings } from "./settings.ts";

export default function cursery(): Plugin {
  return {
    name: "cursery:vitest",
    config: settings,
  };
}
