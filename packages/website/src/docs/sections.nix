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
        slug = "embedding";
        title = "Embedding apps";
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
