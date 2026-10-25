let
  inherit (import <web/dom>) html;
  inherit (import ../../prose.nix)
    code
    heading
    link
    listing
    paragraph
    ;

  # A list of terms, each with its description.
  terms =
    entries:
    html.ul { class = "mt-4 list-disc space-y-2 pl-6"; } (
      map (
        entry:
        html.li [
          (code entry.term)
          ": "
          entry.description
        ]
      ) entries
    );
in
import ../../article.nix "reference" "web-dom" [
  (paragraph [
    "Builders for virtual DOM trees. Apps return them from "
    (code "render")
    ", and server entries return them as pages."
  ])
  (listing "nix" "Exports" ''
    let
      inherit (import <web/dom>) html svg element text;
    in
    html.div { class = "card"; } [
      (html.h1 "Title")
      "Some text"
    ]
  '')

  (heading "Elements")
  (paragraph [
    (code "html")
    " has a builder for each HTML element, and "
    (code "svg")
    " for each SVG element. "
    (code "element")
    " builds any other tag, like a custom element:"
  ])
  (listing "nix" "Builders" ''
    html.p "Hello"
    svg.circle { cx = 5; cy = 5; r = 5; }
    element "my-widget" { name = "Ada"; }
  '')
  (paragraph [
    "Builders take attributes, then children. Both are optional. Attributes come first, at most once, and children append each time they're applied:"
  ])
  (listing "nix" "Applying builders" ''
    html.button
    html.button { type = "button"; } "Save"
    html.button { type = "button"; } "Save" [ "!" ]
  '')
  (paragraph [
    (code "svg")
    " is separate from "
    (code "html")
    " because some tags are in both, like "
    (code "a")
    " and "
    (code "title")
    ". Its elements are in the SVG namespace."
  ])

  (heading "Attributes")
  (terms [
    {
      term = "string";
      description = "set as is.";
    }
    {
      term = "number";
      description = "set as its decimal string.";
    }
    {
      term = "true";
      description = [
        "set to an empty string, like "
        (code "disabled")
        "."
      ];
    }
    {
      term = "false";
      description = "omitted.";
    }
    {
      term = "null";
      description = "omitted.";
    }
  ])
  (paragraph [
    "Other types throw. On "
    (code "input")
    ", "
    (code "textarea")
    ", "
    (code "select")
    ", and "
    (code "option")
    ", "
    (code "value")
    ", "
    (code "checked")
    ", and "
    (code "selected")
    " set the element's properties, so they reflect what it shows."
  ])

  (heading "Classes")
  (paragraph [
    (code "class")
    " takes strings, styles from "
    (code "<web/style>")
    ", "
    (code "null")
    ", or lists of those, nested to any depth."
  ])
  (listing "nix" "Classes" ''
    html.div { class = [ card "p-4" (if active then "ring" else null) ]; }
  '')

  (heading "Keys")
  (paragraph [
    (code "key")
    " identifies an element among its siblings, so it's patched in place rather than recreated when siblings come, go, or reorder. Keys are strings or integers, and "
    (code "1")
    " is the same key as "
    (code "\"1\"")
    ". It isn't rendered."
  ])
  (listing "nix" "Keys" ''
    html.ul (map (item: html.li { key = item.id; } item.text) items)
  '')

  (heading "Event handlers")
  (paragraph [
    (code "on")
    " maps event names to handlers. A handler takes the event and returns an effect from "
    (html.a {
      class = link;
      href = "/docs/guides/host-io/";
    } (code "<web/io>"))
    ", or "
    (code "null")
    " to ignore it."
  ])
  (listing "nix" "Handlers" ''
    html.input {
      on.input = event: io.dispatch "typed" event.target.value;
      on.keydown = event: if event.key == "Escape" then io.dispatch "cancel" null else null;
    }
  '')
  (paragraph "The event is a snapshot:")
  (terms [
    {
      term = "type, key, shiftKey, ...";
      description = "the event's string, number, and boolean fields.";
    }
    {
      term = "target";
      description = [
        "the target's "
        (code "value")
        " and "
        (code "checked")
        ", where it has them."
      ];
    }
    {
      term = "preventDefault";
      description = [
        "an effect that calls "
        (code "event.preventDefault()")
        "."
      ];
    }
  ])
  (paragraph [
    "To run "
    (code "preventDefault")
    " with other effects, combine them:"
  ])
  (listing "nix" "Several effects" ''
    html.form {
      on.submit = event: io.all [ event.preventDefault (io.dispatch "save" null) ];
    }
  '')

  (heading "Children")
  (terms [
    {
      term = "element";
      description = "rendered.";
    }
    {
      term = "string";
      description = "rendered as text, escaped.";
    }
    {
      term = "number";
      description = "rendered as its decimal string.";
    }
    {
      term = "null, true, false";
      description = "rendered as nothing, for conditional rendering.";
    }
    {
      term = "list";
      description = "flattened, however deeply nested.";
    }
    {
      term = "function";
      description = [
        "a component, called with "
        (code "{ }")
        ". Write "
        (code "footer")
        " for "
        (code "footer { }")
        "."
      ];
    }
  ])
  (paragraph [
    "Other types throw. "
    (code "text")
    " builds a text node from a string."
  ])
]
