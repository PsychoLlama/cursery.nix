# Todos, and the actions that change them.

let
  # Trims spaces around `text`.
  trim =
    text:
    let
      matched = builtins.match "[[:space:]]*(.*[^[:space:]])[[:space:]]*" text;
    in
    if matched == null then "" else builtins.head matched;

  # Applies `f` to the todo with `id`.
  updateTodo =
    state: id: f:
    state // { todos = map (todo: if todo.id == id then f todo else todo) state.todos; };

  # Each takes the state and the action's payload, returning the next state.
  handlers = {
    # Ids identify todos in actions, and key their elements.
    add =
      state: payload:
      let
        text = trim payload;
      in
      if text == "" then
        state
      else
        state
        // {
          todos = state.todos ++ [
            {
              id = state.nextId;
              inherit text;
              completed = false;
            }
          ];
          nextId = state.nextId + 1;
        };

    toggle = state: id: updateTodo state id (todo: todo // { completed = !todo.completed; });

    destroy = state: id: state // { todos = builtins.filter (todo: todo.id != id) state.todos; };
  };
in

{
  init = {
    todos = [ ];
    nextId = 0;
  };

  update =
    state: action:
    let
      handler = handlers.${action.type} or (throw "Unknown action \"${action.type}\"");
    in
    handler state (action.payload or null);
}
