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
    (code "?cursery:source")
    ". It loads the app's files and gives the path of its "
    (code "default.nix")
    ", without mounting it. "
    (code "mount")
    " renders the app into an element, and "
    (code "unmount")
    " removes it."
  ])
  (listing "javascript" "src/app.test.js" ''
    import { mount, unmount } from "cursery";
    import { expect, test } from "vitest";

    import app from "./app?cursery:source";

    test("counts clicks", () => {
      const container = document.createElement("div");
      mount(container, app);

      container.querySelector('[aria-label="Increment"]').click();
      expect(container.querySelector("h1").textContent).toBe("Clicked 1 times");

      unmount(container);
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
    " runs a Nix expression and returns its value. Import the app to call its "
    (code "update")
    " directly:"
  ])
  (listing "javascript" "src/update.test.js" ''
    import { evaluate } from "cursery";
    import { expect, test } from "vitest";

    import app from "./app?cursery:source";

    test("increments", () => {
      const count = evaluate(`
        (import ''${app}).update 0 { type = "increment"; payload = null; }
      `);

      expect(count).toBe(1);
    });
  '')

  (heading "Run the tests")
  (shell [ "pnpm vitest" ])
  (paragraph "Vitest watches the files and reruns the tests when they change.")
]
