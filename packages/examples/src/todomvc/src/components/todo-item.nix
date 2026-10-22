let
  inherit (import <web/dom>) html;
  inherit (import <web/io>) dispatch;
  inherit (import <web/style>) css;

  # Shown while hovering its item.
  destroy = css {
    margin-left = "auto";
    padding = "0 0.5rem";
    border = "none";
    background = "none";
    font = "inherit";
    color = "#949494";
    cursor = "pointer";
    opacity = 0;
    "&:hover".color = "#c18585";
  };

  item = css {
    display = "flex";
    align-items = "center";
    gap = "1rem";
    padding = "0.75rem 0.5rem 0.75rem 1rem";
    border-top = "1px solid #ededed";
    font-size = "1.5rem";
    "&:hover .${destroy.name}".opacity = 1;
  };

  toggle = css {
    width = "1.5rem";
    height = "1.5rem";
    margin = 0;
    accent-color = "#5dc2af";
  };

  completed = css {
    color = "#949494";
    text-decoration = "line-through";
  };
in

{ todo }:
html.li { class = item; } [
  (html.input {
    class = toggle;
    type = "checkbox";
    checked = todo.completed;
    on.change = event: dispatch "toggle" todo.id;
  })
  (html.label { class = if todo.completed then completed else null; } todo.text)
  (html.button {
    class = destroy;
    "aria-label" = "Delete";
    on.click = event: dispatch "destroy" todo.id;
  } "×")
]
