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
import ../../article.nix "guides" "styling" [
  (paragraph [
    "Apps style elements with scoped classes from "
    (code "<web/style>")
    ", and the page with global styles."
  ])

  (heading "Scoped styles")
  (paragraph [
    (code "css")
    " turns CSS into a class. Attach it with "
    (code "class")
    ":"
  ])
  (listing "nix" "src/app/default.nix" ''
    let
      inherit (import <web/dom>) html;
      inherit (import <web/style>) css;

      # The body of the class's rule, with native CSS nesting.
      card = css '''
        padding: 1rem;
        border-radius: 0.5rem;

        &:hover {
          background: var(--surface-hover);
        }

        @media (width < 40rem) {
          padding: 0.5rem;
        }
      ''';
    in
    {
      render = _: html.div { class = card; } "Hello";
    }
  '')
  (paragraph [
    "Classes are named by a hash of their CSS. The CSS loads as elements using it render, and server renders put it in the page's "
    (code "assets")
    "."
  ])

  (heading "Combine classes")
  (paragraph [
    (code "class")
    " takes a list of styles and strings. "
    (code "null")
    " adds nothing, for conditional classes:"
  ])
  (listing "nix" "Classes" ''
    html.div { class = [ card "shadow-md" (if active then selected else null) ]; } "Hello"
  '')

  (heading "Style by another class")
  (paragraph "A style interpolates as its selector:")
  (listing "nix" "Selectors" ''
    icon = css "width: 1rem;";

    card = css '''
      &:has(''${icon}) {
        padding-left: 2rem;
      }
    ''';
  '')

  (heading "Global styles")
  (paragraph [
    "An app's "
    (code "styles")
    " is CSS for the whole page:"
  ])
  (listing "nix" "src/app/default.nix" ''
    {
      styles = '''
        :root {
          --surface-hover: #f4f4f5;
        }

        body {
          margin: 0;
          font-family: system-ui, sans-serif;
        }
      ''';
    }
  '')

  (heading "Images")
  (paragraph [
    (code "image")
    " turns elements, like an SVG from "
    (code "<web/dom>")
    ", into a CSS image:"
  ])
  (listing "nix" "Images" ''
    let
      inherit (import <web/dom>) svg;
      inherit (import <web/style>) css image;

      dot = svg.svg { viewBox = "0 0 10 10"; } (svg.circle { cx = 5; cy = 5; r = 5; });
    in
    css "list-style-image: ''${image dot};"
  '')
  (paragraph "The image is static, so its elements can't have handlers or styles.")

  (heading "Other styling tools")
  (paragraph [
    "Optionally, other tools can style the page too, through stylesheets the server entry links. For example, install "
    (html.a {
      class = link;
      href = "https://tailwindcss.com/docs/installation/using-vite";
    } "Tailwind")
    " with its Vite plugin:"
  ])
  (shell [ "pnpm add -D tailwindcss @tailwindcss/vite" ])
  (listing "javascript" "vite.config.js" ''
    import tailwindcss from "@tailwindcss/vite";

    export default defineConfig({
      plugins: [cursery({ /* ... */ }), tailwindcss()],
    });
  '')
  (paragraph "Point it at the app's Nix files:")
  (listing "css" "src/app.css" ''
    @import "tailwindcss";
    @source "./app";
  '')
  (paragraph [
    "Link the stylesheet from the "
    (html.a {
      class = link;
      href = "/docs/guides/structure/";
    } "server entry")
    ":"
  ])
  (listing "nix" "src/page.nix" ''
    (html.head [
      (html.link { rel = "stylesheet"; href = "/src/app.css"; })
      assets
    ])
  '')
  (paragraph [
    "Utility classes go in "
    (code "class")
    " as strings. Scoped styles are in "
    (code "@layer components")
    " and global styles in "
    (code "@layer base")
    ", so utilities override both."
  ])
]
