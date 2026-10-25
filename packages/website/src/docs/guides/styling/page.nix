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
    "Styles can also select each other, and "
    (code "image")
    " makes CSS images from SVG. See "
    (html.a {
      class = link;
      href = "/docs/reference/web-style/";
    } (code "<web/style>"))
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
