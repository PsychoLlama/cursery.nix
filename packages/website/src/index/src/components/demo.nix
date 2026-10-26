# An editor next to the app it describes, running in the playground frame.

let
  inherit (import <web/dom>) html svg;
  inherit (import <web/io>) call dispatch pipe;
  inherit (import ../theme.nix) heading frame;

  # A circular arrow, from Lucide.
  reload =
    svg.svg
      {
        class = "size-3.5";
        viewBox = "0 0 24 24";
        fill = "none";
        stroke = "currentColor";
        stroke-width = 2;
        stroke-linecap = "round";
        stroke-linejoin = "round";
        aria-hidden = "true";
      }
      [
        (svg.path { d = "M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"; })
        (svg.path { d = "M21 3v5h-5"; })
      ];

  # Browser chrome over the preview, to restart the app from `init`.
  toolbar =
    html.div
      { class = "flex items-center gap-1.5 border-b border-[#2b2a33]/10 bg-[#efe9df] px-3 py-1.5"; }
      [
        (map (_: html.span { class = "size-2.5 rounded-full bg-[#2b2a33]/15"; }) [
          1
          2
          3
        ])

        (html.button {
          class = "ml-auto rounded p-1 text-[#6b6875] transition hover:bg-[#2b2a33]/10 hover:text-[#2b2a33] noscript:hidden";
          title = "Reload";
          aria-label = "Reload";
          on.click = _: call "reload" null;
        } reload)
      ];

  # Syntax highlighting, tokenized with a regex. Good enough for the demo.
  keywords = [
    "let"
    "in"
    "inherit"
    "import"
  ];

  highlight =
    source:
    map (
      token:
      if builtins.isString token then
        token
      else
        let
          text = builtins.head token;
          first = builtins.substring 0 1 text;
        in
        if first == ''"'' then
          html.span { class = "text-[#b8d68a]"; } text
        else if first == "<" then
          html.span { class = "text-[#8ec5d6]"; } text
        else if builtins.elem text keywords then
          html.span { class = "text-[#f0a07a]"; } text
        else
          text
    ) (builtins.split ''("[^"]*"|<[^>]*>|[A-Za-z_][A-Za-z0-9_.-]*)'' source);

  # Saves the edit, then shows the frame's error, if any.
  edit =
    event:

    let
      source = event.target.value;
    in

    pipe source [
      (dispatch "source")
      (_: call "preview" source)
      (dispatch "error")
    ];

  # Shared by the editor and its highlighting, laid over each other.
  text = "col-start-1 row-start-1 p-5 font-mono text-sm leading-relaxed whitespace-pre";
in

{ source, error }:
html.div [
  (heading "Try it")
  (html.p { class = "mt-2"; } "A minimal cursery.nix app. Edit it and see.")

  (html.div { class = "relative mt-6"; } [
    (html.div
      {
        class = [
          "${frame} grid bg-white sm:grid-cols-[minmax(0,1fr)_14rem]"
          (if error == null then null else "rounded-b-none")
        ];
      }
      [
        (html.div { class = "min-w-0 overflow-x-auto bg-[#2b2a33] text-[#e8e1d4]"; } [
          (html.div { class = "grid w-max min-w-full"; } [
            # A trailing space keeps a final empty line, as the editor shows it.
            (html.pre {
              class = text;
              aria-hidden = "true";
            } (html.code (highlight source ++ [ " " ])))

            (html.textarea {
              id = "demo-source";
              class = "${text} resize-none overflow-hidden bg-transparent text-transparent caret-[#e8e1d4] outline-none selection:bg-white/20";
              aria-label = "Source";
              spellcheck = "false";
              wrap = "off";
              value = source;
              on.input = edit;
            })
          ])
        ])

        (html.div { class = "flex flex-col bg-[#fbf8f2]"; } [
          toolbar

          (html.div { class = "grid min-h-40 flex-1"; } [
            (html.iframe {
              id = "demo-preview";
              src = "/playground-frame/";
              title = "Demo";
              class = "size-full noscript:hidden";
            })

            (html.p {
              class = "hidden place-self-center p-6 text-center text-sm text-[#6b6875] noscript:block";
            } "Enable JavaScript to try the demo.")
          ])
        ])
      ]
    )

    # Snapped below, over the page, so errors coming and going don't move it.
    # It covers the box's bottom border.
    (
      if error == null then
        null
      else
        html.pre {
          class = "absolute inset-x-0 top-full z-10 -mt-px max-h-36 overflow-auto rounded-b-lg border border-t-0 border-[#2b2a33]/15 bg-[#3a2a2e] px-5 py-3 font-mono scheme-dark text-xs text-[#f0b0a0] shadow-lg";
        } error
    )
  ])
]
