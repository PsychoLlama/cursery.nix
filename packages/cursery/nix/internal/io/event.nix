# Gives an event snapshot from Rust its effects, closing over its `__id` and
# hiding it.

let
  inherit (import ./effects.nix) effect;
in

snapshot:

builtins.removeAttrs snapshot [ "__id" ]
// {
  preventDefault = effect "preventDefault" { event = snapshot.__id; };
}
