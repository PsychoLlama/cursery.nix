let
  inherit (import <web/dom>) html;
  inherit (import <web/style>) css;
  inherit (import ./state.nix) init update;

  header = import ./components/header.nix;
  todoList = import ./components/todo-list.nix;
  toggleAll = import ./components/toggle-all.nix;
  footer = import ./components/footer.nix;

  app = css {
    position = "relative";
    margin-top = "8rem";
    background = "#fff";
    box-shadow = "0 2px 4px rgb(0 0 0 / 0.2), 0 25px 50px rgb(0 0 0 / 0.1)";
  };
in

{
  inherit init update;

  styles = {
    body = {
      max-width = "550px";
      margin = "0 auto";
      padding = "2rem 1rem";
      font = "14px/1.4 system-ui, sans-serif";
      color = "#111";
      background = "#f5f5f5";
    };
  };

  # The list and footer show once there are todos.
  render = state: [
    (html.section { class = app; } [
      (header { })
      (
        if state.todos == [ ] then
          null
        else
          [
            (toggleAll { inherit (state) todos; })
            (todoList { inherit (state) todos editing; })
            (footer { inherit (state) todos; })
          ]
      )
    ])
  ];
}
