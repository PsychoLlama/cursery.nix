let
  inherit (import <web/dom>) html svg;
  inherit (import <web/io>) all dispatch runCommand;
  inherit (import <web/style>) css image;

  # Shown while hovering its item.
  destroy = css {
    position = "absolute";
    top = 0;
    right = "10px";
    bottom = 0;
    display = "none";
    width = "40px";
    height = "40px";
    margin = "auto 0";
    font-size = "30px";
    line-height = 1.1;
    color = "#949494";
    cursor = "pointer";
    transition = "color 0.2s ease-out";
    "&:hover, &:focus".color = "#c18585";
  };

  # Replaces the item while editing, its text lined up with the label's.
  edit = css {
    display = "block";
    box-sizing = "border-box";
    width = "calc(100% - 43px)";
    margin = "0 0 0 43px";
    padding = "12px 16px";
    border = "1px solid #999";
    box-shadow = "inset 0 -1px 5px rgb(0 0 0 / 0.2)";
    font = "inherit";
    font-size = "24px";
    line-height = "1.4em";
    color = "inherit";
    "&:focus".box-shadow = "0 0 2px 2px #cf7d7d";
  };

  item = css {
    position = "relative";
    font-size = "24px";
    border-bottom = "1px solid #ededed";
    "&:last-child".border-bottom = "none";
    "&:hover .${destroy.name}".display = "block";
    "&:has(.${edit.name})".border-bottom = "none";
  };

  # A circle, green and ticked while checked.
  circle =
    { checked }:
    svg.svg
      {
        width = 40;
        height = 40;
        viewBox = "-10 -18 100 135";
      }
      [
        (svg.circle {
          cx = 50;
          cy = 50;
          r = 50;
          fill = "none";
          stroke = if checked then "#59a193" else "#949494";
          stroke-width = 3;
        })
        (
          if checked then
            svg.path {
              fill = "#3ea390";
              d = "M72 25L42 71 27 56l-4 4 20 20 34-52z";
            }
          else
            null
        )
      ];

  toggle = css {
    position = "absolute";
    top = 0;
    bottom = 0;
    width = "40px";
    height = "40px";
    margin = "auto 0";
    appearance = "none";
    background = "${
      image (circle {
        checked = false;
      })
    } no-repeat center";
    cursor = "pointer";
    "&:checked".background-image = image (circle {
      checked = true;
    });
  };

  label = css {
    display = "block";
    padding = "15px 15px 15px 60px";
    overflow-wrap = "break-word";
    font-weight = 400;
    line-height = 1.2;
    color = "#484848";
    transition = "color 0.4s";
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
  html.li { class = item; } [
    (html.input {
      id = editId todo;
      class = edit;
      value = todo.text;
      on.keydown =
        event:
        if event.key == "Enter" then
          save todo event
        else if event.key == "Escape" then
          dispatch "cancel" null
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
      class = [
        label
        (if todo.completed then completed else null)
      ];

      # Renders the field, then focuses it.
      on.dblclick =
        event:
        all [
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
