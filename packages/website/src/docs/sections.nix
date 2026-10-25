# The docs' sections, after Diátaxis: lessons, recipes, and facts to look
# up. Each is a directory with a `page.nix`, served at `/docs/<slug>/`, and
# its `pages` are subdirectories of it, at `/docs/<slug>/<page>/`.
[
  {
    slug = "getting-started";
    title = "Getting started";
    description = "Lessons that walk you through your first app, step by step.";
    pages = [ ];
  }
  {
    slug = "guides";
    title = "Guides";
    description = "Recipes for specific tasks, once you know the basics.";
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
    description = "The API, described precisely: elements, styles, effects, and the Vite plugin.";
    pages = [ ];
  }
]
