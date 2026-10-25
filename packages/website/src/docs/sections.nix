# The docs' sections, in the sidebar's order. Each is a directory with a
# `page.nix`, served at its `href`, and its `pages` are subdirectories of it,
# at `/docs/<slug>/<page>/`.
[
  {
    slug = "getting-started";
    title = "Getting started";
    # The docs' landing page.
    href = "/docs/";
    pages = [ ];
  }
  {
    slug = "guides";
    title = "Guides";
    href = "/docs/guides/";
    pages = [
      {
        slug = "structure";
        title = "App structure";
        description = "The parts of an app, and the page it renders into.";
      }
      {
        slug = "pages";
        title = "Pages";
        description = "Configure the pages the Vite plugin builds.";
      }
      {
        slug = "styling";
        title = "Styling";
        description = "Scoped classes and global styles.";
      }
      {
        slug = "host-io";
        title = "Host IO";
        description = "Call JavaScript from Nix, and dispatch actions from JavaScript.";
      }
      {
        slug = "embedding";
        title = "Embedding";
        description = "Add an app to an existing JavaScript application.";
      }
      {
        slug = "pre-rendering";
        title = "Pre-rendering";
        description = "Render a page to an HTML string from Node.";
      }
      {
        slug = "testing";
        title = "Testing";
        description = "Test an app with Vitest.";
      }
    ];
  }
  {
    slug = "reference";
    title = "Reference";
    href = "/docs/reference/";
    pages = [
      {
        slug = "web-dom";
        title = "<web/dom>";
        description = "Elements, attributes, event handlers, and children.";
      }
      {
        slug = "web-io";
        title = "<web/io>";
        description = "Effects, and ways to combine them.";
      }
      {
        slug = "web-static";
        title = "<web/static>";
        description = "Render apps ahead of time.";
      }
      {
        slug = "web-style";
        title = "<web/style>";
        description = "Scoped styles and CSS images.";
      }
      {
        slug = "api";
        title = "API";
        description = "The JavaScript exports of the cursery package.";
      }
    ];
  }
]
