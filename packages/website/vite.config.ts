import tailwind from "@tailwindcss/vite";
import cursery from "cursery/vite-plugin";
import { defineConfig } from "vite";

import highlight from "./highlight.ts";

// The docs are HTML only, a page for each section and one over them all.
const docs = Object.fromEntries(
  [
    "index",
    "getting-started",
    "guides",
    "guides/pre-rendering",
    "guides/testing",
    "reference",
  ].map((page) => [
    page === "index" ? "docs/index.html" : `docs/${page}/index.html`,
    {
      entry: {
        server: `./docs/${page}/page.nix`,
        client: { type: "static" as const },
      },
    },
  ]),
);

export default defineConfig({
  // Serves each example at `/<example>/`.
  root: "src",
  plugins: [
    tailwind(),
    highlight(),
    cursery({
      pages: {
        "index.html": {
          entry: {
            server: "./index/page.nix",
            client: {
              type: "nix",
              path: "./index/src",
              effects: "./index/effects.ts",
            },
          },
        },
        "hello-world/index.html": {
          entry: {
            server: "./hello-world/page.nix",
            client: { type: "nix", path: "./hello-world/src" },
          },
        },
        "playground-frame/index.html": {
          entry: {
            server: "./playground-frame/page.nix",
            client: { type: "manual", path: "./playground-frame/main.ts" },
          },
        },
        "todomvc/index.html": {
          entry: {
            server: "./todomvc/page.nix",
            client: {
              type: "nix",
              path: "./todomvc/src",
              effects: "./todomvc/effects.ts",
            },
          },
        },
        ...docs,
      },
    }),
  ],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
});
