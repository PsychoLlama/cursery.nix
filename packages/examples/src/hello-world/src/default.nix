let
  inherit (import <web/dom>) html;
  inherit (import <web/io>) dispatch;
  inherit (import <web/style>) css;

  greeting = css {
    font-size = "2.5rem";
    letter-spacing = "-0.02em";
    margin = "0 0 2rem";
  };

  field = css {
    display = "flex";
    gap = "0.5rem";
    align-items = "baseline";
  };

  input = css {
    font = "inherit";
  };
in

{
  styles = {
    body = {
      max-width = "40rem";
      margin = "0 auto";
      padding = "4rem 1rem";
      font = "18px/1.6 system-ui, sans-serif";
      color = "#333";
      background = "#fdfdfd";
    };
  };

  init = {
    name = "world";
  };

  update = state: action: state // { name = action.payload; };

  render =
    state:
    html.main [
      (html.h1 { class = greeting; } "Hello, ${state.name}!")
      (html.label { class = field; } [
        "Name:"
        (html.input {
          class = input;
          value = state.name;
          on.input = event: dispatch "rename" event.target.value;
        })
      ])
    ];
}
