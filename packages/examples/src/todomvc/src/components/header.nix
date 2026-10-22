let
  inherit (import <web/dom>) html;
  inherit (import <web/io>) dispatch;
  inherit (import <web/style>) css;

  # Sits above the card, which leaves room for it.
  title = css {
    position = "absolute";
    bottom = "100%";
    width = "100%";
    margin = "0 0 1rem";
    text-align = "center";
    font-size = "5rem";
    font-weight = 200;
    color = "#b83f45";
  };

  new-todo = css {
    box-sizing = "border-box";
    width = "100%";
    padding = "1rem 1rem 1rem 3.75rem";
    border = "none";
    font = "inherit";
    font-size = "1.5rem";
    "&::placeholder" = {
      font-style = "italic";
      color = "#999";
    };
  };
in

{ }:
html.header [
  (html.h1 { class = title; } "todos")

  # Always empty: adding re-renders, which clears what was typed.
  (html.input {
    class = new-todo;
    placeholder = "What needs to be done?";
    autofocus = true;
    value = "";
    on.keydown = event: if event.key == "Enter" then dispatch "add" event.target.value else null;
  })
]
