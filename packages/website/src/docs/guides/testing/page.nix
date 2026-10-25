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

  (heading "Test Nix files")
  (paragraph [
    "Import the app's files with "
    (code "?cursery:raw")
    ", and load them. "
    (code "evaluate")
    " can then call any file by its path, with inputs:"
  ])
  (listing "nix" "src/app/plural.nix" ''
    count: noun: if count == 1 then "1 ''${noun}" else "''${toString count} ''${noun}s"
  '')
  (listing "javascript" "src/plural.test.js" ''
    import { evaluate, load } from "cursery";
    import { expect, test } from "vitest";

    import files from "./app?cursery:raw";

    const app = load(files);

    test("pluralizes", () => {
      expect(evaluate(`import ''${app}/plural.nix 1 "click"`)).toBe("1 click");
      expect(evaluate(`import ''${app}/plural.nix 2 "click"`)).toBe("2 clicks");
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
    " and "
    (code "?cursery:raw")
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
