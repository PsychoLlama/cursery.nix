let
  inherit (import <web/dom>) html;
  inherit (import ../theme.nix) heading code;

  features = [
    {
      name = "Virtual DOM";
      body = [
        (code "render")
        " returns a tree of elements. After each update, the new tree is diffed against the old one, and only what changed touches the DOM."
      ];
    }
    {
      name = "Scoped styles";
      body = [
        (code "css")
        " turns a block of CSS into a class, named by its hash. Nest selectors and media queries inside it."
      ];
    }
    {
      name = "Hot reloading";
      body = [
        "Save a "
        (code ".nix")
        " file and Vite swaps in the new code. The app keeps its state."
      ];
    }
    {
      name = "Declarative effects";
      body = [
        "Effects are values, chained with "
        (code "io.pipe")
        " and "
        (code "io.catch")
        ". Returned by event handlers or "
        (code "update")
        " and executed by the runtime."
      ];
    }
    {
      name = "Host interop";
      body = [
        "Pass JavaScript functions to "
        (code "mount")
        " and call them from Nix with "
        (code "io.call")
        ". If one returns a promise, Nix waits for it."
      ];
    }
    {
      name = "Static rendering";
      body = [
        (code "renderToString")
        " renders an app to HTML. The Vite plugin uses it to prerender pages, and the app mounts over them in the browser."
      ];
    }
  ];
in

{ }:
html.section [
  (heading "Features")

  (html.ul { class = "mt-6 grid gap-x-10 gap-y-8 sm:grid-cols-2"; } (
    map (
      feature:
      html.li [
        (html.h3 { class = "font-semibold"; } feature.name)
        (html.p { class = "mt-1 text-[#4a4853]"; } feature.body)
      ]
    ) features
  ))
]
