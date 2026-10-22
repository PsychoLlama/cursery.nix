let
  inherit (import <web/dom>) html;
  inherit (import <web/io>) dispatch;
  inherit (import <web/style>) css;

  # A chevron in the new todo field's padding, darker while checked.
  toggleAll = css {
    position = "absolute";
    top = "-65px";
    left = 0;
    display = "flex";
    align-items = "center";
    justify-content = "center";
    width = "45px";
    height = "65px";
    font-size = "22px";
    color = "#949494";
    cursor = "pointer";
    "&:has(:checked)".color = "#484848";
    "&:has(:focus-visible)".box-shadow = "0 0 2px 2px #cf7d7d";
    "&::before" = {
      content = ''"❯"'';
      transform = "rotate(90deg)";
    };
  };

  # Still focusable and announced, but unseen.
  hidden = css {
    position = "absolute";
    opacity = 0;
    width = "1px";
    height = "1px";
    margin = 0;
  };
in

{ todos }:
html.label { class = toggleAll; } [
  (html.input {
    class = hidden;
    type = "checkbox";
    "aria-label" = "Mark all as complete";
    checked = builtins.all (todo: todo.completed) todos;
    on.change = event: dispatch "toggleAll" event.target.checked;
  })
]
