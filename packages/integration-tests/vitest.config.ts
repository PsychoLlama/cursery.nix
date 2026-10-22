import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/__tests__/*.test.ts"],
    setupFiles: ["src/setup.ts"],
    server: {
      deps: {
        // Load the wasm bindings natively. Under jsdom, Vite rewrites
        // `new URL(..., import.meta.url)` to an `http:` asset URL, which
        // breaks the `readFileSync` that loads the `.wasm` file.
        external: [/\/cursery\/dist\//],
      },
    },
  },
});
