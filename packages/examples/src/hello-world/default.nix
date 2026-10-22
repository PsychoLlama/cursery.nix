let
  inherit (import <web/dom>) html;
in

{
  init = {
    name = "world";
  };

  update = state: name: state // { inherit name; };

  render =
    state:
    html.main [
      (html.h1 "Hello, ${state.name}!")
      (html.label [
        "Name: "
        (html.input {
          value = state.name;
          on.input = event: event.target.value;
        })
      ])
    ];
}
