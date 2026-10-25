let
  inherit (import ../../prose.nix)
    code
    heading
    listing
    paragraph
    shell
    ;
in
import ../../article.nix "guides" "testing" [
  (paragraph "Apps are tested with Vitest. Tests run in jsdom, which provides a DOM to mount the app into.")

  (heading "Set up")
  (paragraph "Install Vitest and jsdom:")
  (shell [ "pnpm add -D vitest jsdom" ])
  (paragraph [
    "Create "
    (code "vitest.config.js")
    " with the plugin from "
    (code "cursery/vitest")
    " and the test environment:"
  ])
  (listing "javascript" "vitest.config.js" ''
    import cursery from "cursery/vitest";
    import { defineConfig, mergeConfig } from "vitest/config";

    import vite from "./vite.config.js";

    export default mergeConfig(
      vite,
      defineConfig({
        plugins: [cursery()],
        test: {
          environment: "jsdom",
        },
      }),
    );
  '')
  (paragraph [
    "The plugin lets cursery load in Vitest, and stubs the parts of the DOM that jsdom lacks. Its settings are merged with the ones in "
    (code "test")
    ". Merging in "
    (code "vite.config.js")
    " keeps the Vite plugin, which tests use to import the app."
  ])

  (heading "Test the app")
  (paragraph [
    "Tests import the app with "
    (code "?cursery=app")
    ", as in the browser. "
    (code "mount")
    " renders it into an element and returns a function that unmounts it."
  ])
  (listing "javascript" "src/app.test.js" ''
    import { expect, test } from "vitest";

    import app from "./app?cursery=app";

    test("counts clicks", () => {
      const container = document.createElement("div");
      const unmount = app.mount(container);

      container.querySelector('[aria-label="Increment"]').click();
      expect(container.querySelector("h1").textContent).toBe("Clicked 1 times");

      unmount();
    });
  '')
  (paragraph [
    "Events dispatch actions, and the app re-renders before "
    (code "click")
    " returns."
  ])

  (heading "Test the update function")
  (paragraph [
    (code "evaluate")
    " runs a Nix expression and returns its value. Load the app's files to call its "
    (code "update")
    " directly:"
  ])
  (listing "javascript" "src/update.test.js" ''
    import { evaluate, load, unload } from "cursery";
    import { expect, test } from "vitest";

    const files = import.meta.glob("./app/**/*.nix", {
      query: "?raw",
      import: "default",
      eager: true,
    });

    test("increments", () => {
      const path = load(files);
      const count = evaluate(`
        (import ''${path}/app).update 0 { type = "increment"; payload = null; }
      `);
      unload(path);

      expect(count).toBe(1);
    });
  '')

  (heading "Run the tests")
  (shell [ "pnpm vitest" ])
  (paragraph "Vitest watches the files and reruns the tests when they change.")
]
