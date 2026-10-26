import tailwind from "@tailwindcss/vite";
import cursery from "cursery/vite-plugin";
import { defineConfig } from "vite";

import highlight from "./highlight.ts";

// The docs are HTML only, a page for each section and guide. Getting started
// is the landing page.
const docs = Object.fromEntries(
  [
    "getting-started",
    "guides",
    "guides/structure",
    "guides/pages",
    "guides/styling",
    "guides/host-io",
    "guides/embedding",
    "guides/pre-rendering",
    "guides/testing",
    "reference",
    "reference/web-dom",
    "reference/web-io",
    "reference/web-static",
    "reference/web-style",
    "reference/api",
    "reference/vite-plugin",
  ].map((page) => [
    page === "getting-started" ? "docs/index.html" : `docs/${page}/index.html`,
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
              path: "./src/index/app",
              effects: "./src/index/effects.ts",
            },
          },
        },
        "hello-world/index.html": {
          entry: {
            server: "./src/hello-world/page.nix",
            client: { type: "nix", path: "./src/hello-world/app" },
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
              path: "./src/todomvc/app",
              effects: "./src/todomvc/effects.ts",
            },
          },
        },
        ...docs,
      },
    }),
  ],
});
