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
    "guides/structure",
    "guides/pages",
    "guides/host-io",
    "guides/embedding",
    "guides/pre-rendering",
    "guides/testing",
    "reference",
  ].map((page) => [
    page === "index" ? "docs/index.html" : `docs/${page}/index.html`,
    {
      entry: {
        server: `./src/docs/${page}/page.nix`,
        client: { type: "static" as const },
      },
    },
  ]),
);

export default defineConfig({
  plugins: [
    tailwind(),
    highlight(),
    cursery({
      pages: {
        "index.html": {
          entry: {
            server: "./src/index/page.nix",
            client: {
              type: "nix",
              path: "./src/index/src",
              effects: "./src/index/effects.ts",
            },
          },
        },
        "hello-world/index.html": {
          entry: {
            server: "./src/hello-world/page.nix",
            client: { type: "nix", path: "./src/hello-world/src" },
          },
        },
        "playground-frame/index.html": {
          entry: {
            server: "./src/playground-frame/page.nix",
            client: { type: "manual", path: "./src/playground-frame/main.ts" },
          },
        },
        "todomvc/index.html": {
          entry: {
            server: "./src/todomvc/page.nix",
            client: {
              type: "nix",
              path: "./src/todomvc/src",
              effects: "./src/todomvc/effects.ts",
            },
          },
        },
        ...docs,
      },
    }),
  ],
});
