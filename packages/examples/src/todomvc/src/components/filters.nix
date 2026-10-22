let
  inherit (import <web/dom>) html;
  inherit (import <web/io>) dispatch;
  inherit (import <web/style>) css;

  # Centered across the footer, behind the count and clear button.
  filters = css {
    position = "absolute";
    right = 0;
    left = 0;
    margin = 0;
    padding = 0;
    list-style = "none";
    "& li".display = "inline";
  };

  link = css {
    margin = "3px";
    padding = "3px 7px";
    border = "1px solid transparent";
    border-radius = "3px";
    color = "inherit";
    text-decoration = "none";
    "&:hover".border-color = "#db7676";
    "&[aria-current]".border-color = "#ce4646";
  };

  # Each filter by name, and its link's hash.
  options = [
    {
      name = "all";
      label = "All";
      hash = "#/";
    }
    {
      name = "active";
      label = "Active";
      hash = "#/active";
    }
    {
      name = "completed";
      label = "Completed";
      hash = "#/completed";
    }
  ];
in

# Following a link updates the hash as usual, and dispatches its filter.
{ filter }:
html.ul { class = filters; } (
  map (
    option:
    html.li [
      (html.a {
        class = link;
        aria-current = if option.name == filter then "page" else null;
        href = option.hash;
        on.click = event: dispatch "filter" option.name;
      } option.label)
    ]
  ) options
)
