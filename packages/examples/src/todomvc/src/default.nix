let
  inherit (import <web/dom>) html;
  inherit (import <web/style>) css;
  inherit (import ./state.nix) init update visible;

  header = import ./components/header.nix;
  todoList = import ./components/todo-list.nix;
  toggleAll = import ./components/toggle-all.nix;
  footer = import ./components/footer.nix;
  info = import ./components/info.nix;

  app = css {
    position = "relative";
    margin = "130px 0 40px";
    background = "#fff";
    box-shadow = "0 2px 4px rgb(0 0 0 / 0.2), 0 25px 50px rgb(0 0 0 / 0.1)";
  };

  main = css {
    position = "relative";
    border-top = "1px solid #e6e6e6";
  };
in

{
  inherit init update;

  styles = {
    body = {
      min-width = "230px";
      max-width = "550px";
      margin = "0 auto";
      font = "300 14px/1.4em 'Helvetica Neue', Helvetica, Arial, sans-serif";
      color = "#111";
      background = "#f5f5f5";
    };

    button = {
      appearance = "none";
      padding = 0;
      border = 0;
      background = "none";
      font = "inherit";
      color = "inherit";
    };

    ":focus" = {
      outline = 0;
      box-shadow = "0 0 2px 2px #cf7d7d";
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
            (html.main { class = main; } [
              (toggleAll { inherit (state) todos; })
              (todoList {
                inherit (state) editing;
                todos = visible state;
              })
            ])
            (footer { inherit (state) todos filter; })
          ]
      )
    ])
    (info { })
  ];
}
