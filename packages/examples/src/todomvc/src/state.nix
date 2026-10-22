# Todos, and the actions that change them.

let
  # Trims spaces around `text`.
  trim =
    text:
    let
      matched = builtins.match "[[:space:]]*(.*[^[:space:]])[[:space:]]*" text;
    in
    if matched == null then "" else builtins.head matched;

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
