let
  inherit (import <web/dom>) html;
  inherit (import ../../prose.nix)
    code
    heading
    link
    listing
    paragraph
    shell
    ;
in
import ../../article.nix "guides" "testing" [
  (paragraph [
    "Apps run in any test environment with a DOM, such as "
    (html.a {
      class = link;
      href = "https://github.com/jsdom/jsdom";
    } "jsdom")
    ". This guide uses "
    (html.a {
      class = link;
      href = "https://vitest.dev";
    } "Vitest")
    " and "
    (html.a {
      class = link;
      href = "https://testing-library.com/docs/dom-testing-library/intro";
    } "DOM Testing Library")
    "."
  ])

  (heading "Set up")
  (shell [ "pnpm add -D vitest jsdom @testing-library/dom" ])
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
    (code "cursery/vitest")
    " keeps Vitest from transforming cursery's WebAssembly bindings, and adds "
    (code "cursery/testing/setup")
    " to the setup files. Merging in "
    (code "vite.config.js")
    " adds the cursery Vite plugin, which handles the "
    (code "?cursery:source")
    " imports below."
  ])

  (heading "Test the app")
  (paragraph [
    "Importing an app's directory with "
    (code "?cursery:source")
    " loads its Nix files and exports the path of its "
    (code "default.nix")
    ". "
    (code "mount")
    " renders the app at that path into an element, replacing its contents, and "
    (code "unmount")
    " removes it."
  ])
  (listing "javascript" "src/app.test.js" ''
    import { fireEvent, screen } from "@testing-library/dom";
    import { mount, unmount } from "cursery";
    import { expect, test } from "vitest";

    import app from "./app?cursery:source";

    test("counts clicks", () => {
      mount(document.body, app);

      fireEvent.click(screen.getByRole("button", { name: "Increment" }));
      expect(screen.getByRole("heading").textContent).toBe("Clicked 1 times");

      unmount(document.body);
    });
  '')
  (paragraph [
    "Actions are handled and the app re-rendered synchronously, so the DOM is current when "
    (code "fireEvent")
    " returns."
  ])

  (heading "Test the update function")
  (paragraph [
    (code "evaluate")
    " runs a Nix expression and returns its result as a JavaScript value. Calling the app's "
    (code "update")
    " with a state and an action returns the next state:"
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

  (heading "Other test runners")
  (paragraph [
    "Import "
    (code "cursery/testing/setup")
    " before the tests. It adds "
    (code "adoptedStyleSheets")
    ", which jsdom lacks and apps use to apply their styles."
  ])
  (paragraph [
    (code "?cursery:source")
    " imports need the Vite plugin. Without it, load the app's files with "
    (code "load")
    ", as in "
    (html.a {
      class = link;
      href = "/docs/guides/pre-rendering/";
    } "Pre-rendering")
    "."
  ])
]
