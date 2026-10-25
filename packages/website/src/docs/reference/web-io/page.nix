let
  inherit (import <web/dom>) html;
  inherit (import ../../prose.nix)
    code
    heading
    link
    listing
    paragraph
    ;
in
import ../../article.nix "reference" "web-io" [
  (paragraph [
    "Effects, and ways to combine them. An effect describes work for the app to do. Return one from an event handler, or from "
    (code "update")
    " in place of a state, to run it."
  ])
  (listing "nix" "Exports" ''
    let
      io = import <web/io>;
    in
    html.button { on.click = event: io.dispatch "increment" null; } "+"
  '')

  (heading "Running effects")
  (paragraph [
    "Each effect has an output, which the next step in a chain receives. Chains run synchronously, rendering as they go, until an "
    (code "io.call")
    " effect returns a promise. Then the rest of the chain waits for it, and is dropped if the app unmounts first."
  ])
  (paragraph [
    "A failure skips ahead to the nearest "
    (code "io.catch")
    ". Failures nothing catches are logged with "
    (code "console.error")
    ". Values passed between steps are deeply evaluated, so a thunk that throws fails at the step that made it, not wherever it's read later."
  ])

  (heading "io.dispatch")
  (listing "nix" "Signature" ''
    io.dispatch type payload
  '')
  (paragraph [
    "Sends an action to "
    (code "update")
    ", which gets "
    (code "{ type; payload; }")
    ". "
    (code "type")
    " is a string. Pass "
    (code "null")
    " for no payload. The app renders the new state, and the output is that state."
  ])
  (paragraph [
    "If "
    (code "update")
    " returns an effect instead, that runs in the dispatch's place, leaving the state as it is. The output is the effect's output."
  ])

  (heading "io.call")
  (listing "nix" "Signature" ''
    io.call name input
  '')
  (paragraph [
    "Calls the effect "
    (code "name")
    " the host passed to "
    (code "mount")
    ", with "
    (code "input")
    " converted to JavaScript. The output is what it returned, or what its promise resolved to. To define effects, see "
    (html.a {
      class = link;
      href = "/docs/guides/host-io/";
    } "Host IO")
    "."
  ])
  (paragraph [
    "Inputs and outputs must be JSON-compatible. "
    (code "undefined")
    " outputs "
    (code "null")
    ". Errors, rejections, and missing effects fail the call, naming the effect."
  ])

  (heading "io.pipe")
  (listing "nix" "Signature" ''
    io.pipe value [ function ... ]
  '')
  (paragraph [
    "Threads "
    (code "value")
    " through each function in turn. When one returns an effect, the next gets its output once it runs:"
  ])
  (listing "nix" "Pipes" ''
    io.pipe null [
      (_: io.call "load" "count")
      (count: io.dispatch "loaded" count)
    ]
  '')
  (paragraph [
    "Returns an effect if any function returned one, or else the last function's value. "
    (code "io.catch handler")
    " is a step too: it handles failures of every step before it, and steps after it get its result."
  ])

  (heading "io.map")
  (listing "nix" "Signature" ''
    io.map function effect
  '')
  (paragraph [
    "Runs "
    (code "effect")
    ", then calls "
    (code "function")
    " with its output. If that returns an effect, it runs next, and its output is the chain's. Otherwise the value is."
  ])
  (listing "nix" "Maps" ''
    io.map (count: io.dispatch "loaded" count) (io.call "load" "count")
  '')

  (heading "io.catch")
  (listing "nix" "Signature" ''
    io.catch handler effect
  '')
  (paragraph [
    "Runs "
    (code "effect")
    ". If it fails, calls "
    (code "handler")
    " with "
    (code "{ message; }")
    ", and carries on from what it returns: a value, or an effect to run. Successes pass through untouched."
  ])
  (listing "nix" "Catching" ''
    io.catch (error: io.dispatch "failed" error.message) (io.call "save" state)
  '')

  (heading "io.all")
  (listing "nix" "Signature" ''
    io.all [ effect ... ]
  '')
  (paragraph [
    "Runs effects in order, each after the last finishes. The output is a list of their outputs. It stops at the first failure. Values that aren't effects are outputs already."
  ])
  (listing "nix" "Several effects" ''
    html.form {
      on.submit = event: io.all [ event.preventDefault (io.dispatch "save" null) ];
    }
  '')

  (heading "Event effects")
  (paragraph [
    "Snapshots of DOM events carry "
    (code "event.preventDefault")
    ", an effect that calls "
    (code "preventDefault()")
    " on the event. It fails once the event finishes dispatching, so run it before any effect that waits on a promise. See "
    (html.a {
      class = link;
      href = "/docs/reference/web-dom/";
    } (code "<web/dom>"))
    "."
  ])
]
