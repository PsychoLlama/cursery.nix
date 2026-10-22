# Serializes rules (see `<web/style>`) to CSS.
#
# Attrsets are blocks: nested selectors and at-rules, written out as native
# CSS nesting. Lists of attrsets repeat a block, e.g. for `@font-face`.
# Anything else is a declaration: a string, a number, `null` to omit it, or a
# list of those to repeat it in order.

let
  # Declaration values, in order. `null` omits one.
  values =
    property: value:
    builtins.concatMap (
      value:
      if value == null then
        [ ]
      else if builtins.isString value then
        [ value ]
      else if builtins.isInt value || builtins.isFloat value then
        [ (builtins.toJSON value) ]
      else
        throw "Invalid value for \"${property}\" of type ${builtins.typeOf value}: expected a string, number, null, or a list of those"
    ) (if builtins.isList value then value else [ value ]);

  isBlock =
    value:
    builtins.isAttrs value
    || builtins.isList value && value != [ ] && builtins.all builtins.isAttrs value;

  # The contents of a block: its declarations, then its nested blocks.
  block =
    rules:
    let
      names = builtins.attrNames rules;
      nested = builtins.filter (name: isBlock rules.${name}) names;

      declarations = builtins.concatMap (
        name: map (value: "${name}: ${value};") (values name rules.${name})
      ) (builtins.filter (name: !isBlock rules.${name}) names);

      blocks = builtins.concatMap (
        name:
        map (rules: "${name} { ${block rules} }") (
          if builtins.isList rules.${name} then rules.${name} else [ rules.${name} ]
        )
      ) nested;
    in
    builtins.concatStringsSep " " (declarations ++ blocks);

  # Rules for selectors, rather than a class.
  global =
    rules:
    if !builtins.isAttrs rules then
      throw "Invalid global styles of type ${builtins.typeOf rules}: expected an attrset of selectors"
    else
      let
        declarations = builtins.filter (name: !isBlock rules.${name}) (builtins.attrNames rules);
      in
      if declarations != [ ] then
        throw "Invalid global style \"${builtins.head declarations}\": expected a selector or at-rule with rules"
      else
        block rules;
in

{
  inherit block global;
}
