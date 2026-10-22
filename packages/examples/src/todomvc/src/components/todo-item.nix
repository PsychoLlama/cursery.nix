let
  inherit (import <web/dom>) html;
  inherit (import <web/io>) dispatch runCommand;
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

  # Replaces the item while editing, its text lined up with the label's.
  edit = css {
    box-sizing = "border-box";
    width = "100%";
    padding = "0.75rem 1rem 0.75rem 3.5rem";
    border = "none";
    border-top = "1px solid #ededed";
    font = "inherit";
    font-size = "1.5rem";
    box-shadow = "inset 0 -1px 5px rgb(0 0 0 / 0.2)";
    outline = "1px solid #999";
  };

  completed = css {
    color = "#949494";
    text-decoration = "line-through";
  };

  # Fields only autofocus on page load, so this runs a script to focus one.
  focus = id: runCommand "focus" { inherit id; } "document.getElementById($id).focus()";

  # Ids of edit fields, for `focus`.
  editId = todo: "edit-${toString todo.id}";

  save =
    todo: event:
    dispatch "save" {
      inherit (todo) id;
      text = event.target.value;
    };
in

{ todo, editing }:
if editing then
  html.li [
    (html.input {
      id = editId todo;
      class = edit;
      value = todo.text;
      on.keydown =
        event:
        if event.key == "Enter" then
          save todo event
        else if event.key == "Escape" then
          dispatch "cancel"
        else
          null;
      on.blur = save todo;
    })
  ]
else
  html.li { class = item; } [
    (html.input {
      class = toggle;
      type = "checkbox";
      checked = todo.completed;
      on.change = event: dispatch "toggle" todo.id;
    })

    (html.label {
      class = if todo.completed then completed else null;

      # Renders the field, then focuses it.
      on.dblclick = event: [
        (dispatch "edit" todo.id)
        (focus (editId todo))
      ];
    } todo.text)

    (html.button {
      class = destroy;
      "aria-label" = "Delete";
      on.click = event: dispatch "destroy" todo.id;
    } "×")
  ]
