let
  inherit (import <web/dom>) html;
  inherit (import ../theme.nix) heading code;

  features = [
    {
      name = "Virtual DOM";
      body = "Views are functions of state. Unchanged elements stay put.";
    }
    {
      name = "Scoped styles";
      body = "CSS next to your elements, with hashed class names.";
    }
    {
      name = "Hot reloading";
      body = [
        "Edit a "
        (code ".nix")
        " file and the app updates in place, state and all."
      ];
    }
    {
      name = "Effects as data";
      body = "Handlers return descriptions of side effects. The runtime runs them.";
    }
    {
      name = "Host interop";
      body = [
        "Call JavaScript functions with "
        (code "io.call")
        ", and wait on the promises they return."
      ];
    }
    {
      name = "Static rendering";
      body = [
        "Render apps to HTML with "
        (code "renderToString")
        ", then mount over it in the browser."
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
