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
  (paragraph [
    "Set the test environment in "
    (code "vite.config.js")
    ":"
  ])
  (listing "javascript" "vite.config.js" ''
    export default defineConfig({
      // ...
      test: {
        environment: "jsdom",
      },
    });
  '')

  (heading "Test the app")
  (paragraph [
    "Import the app with "
    (code "?cursery:source")
    " and mount it:"
  ])
  (listing "javascript" "src/app.test.js" ''
    import { fireEvent, screen } from "@testing-library/dom";
    import { mount, unmount } from "cursery";
    import { expect, test } from "vitest";

    // The path of the app's `default.nix`, loaded but not mounted.
    import app from "./app?cursery:source";

    test("counts clicks", () => {
      mount(document.body, app);

      // The app re-renders before `fireEvent` returns.
      fireEvent.click(screen.getByRole("button", { name: "Increment" }));
      expect(screen.getByRole("heading").textContent).toBe("Clicked 1 times");

      unmount(document.body);
    });
  '')

  (heading "Test the update function")
  (paragraph [
    (code "evaluate")
    " runs a Nix expression, so tests can call "
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

  (heading "Other test runners")
  (paragraph [
    "Import "
    (code "cursery/testing/setup")
    " before the tests. It polyfills missing jsdom features."
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
