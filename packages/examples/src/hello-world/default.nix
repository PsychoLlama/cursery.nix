let
  inherit (import <web/dom>) html;
  inherit (import <web/io>) dispatch;
in

{
  init = {
    name = "world";
  };

  update = state: action: state // { name = action.payload; };

  render =
    state:
    html.main [
      (html.h1 "Hello, ${state.name}!")
      (html.label [
        "Name: "
        (html.input {
          value = state.name;
          on.input = event: dispatch "rename" event.target.value;
        })
      ])
    ];
}
