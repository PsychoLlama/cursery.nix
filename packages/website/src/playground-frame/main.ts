/**
 * Renders apps posted from the parent page, for live demos in an iframe.
 *
 * Messages in are `{ id, files, entry?, reset? }`: `files` as `load` takes
 * them, and `entry` the app's `default.nix` among them. Each one remounts
 * the app in place, keeping its state, unless `reset` is set. If it fails,
 * the last working version stays.
 *
 * Messages out are `{ type: "ready" }` once listening, then a
 * `{ type: "mounted", id }` or `{ type: "error", id, message }` for each
 * message in. Only same-origin parents are heard: posted apps render under
 * this origin.
 */

import { load, mount, unload, unmount } from "cursery";

interface Render {
  id: unknown;
  files: Record<string, string>;
  entry?: string;
  reset?: boolean;
}

const container = document.getElementById("app")!;
let mounted = false;

function render({ files, entry = "default.nix", reset }: Render) {
  if (reset && mounted) {
    unmount(container);
    mounted = false;
  }

  const path = load(files);

  try {
    mount(container, `${path}/${entry}`);
    mounted = true;
  } finally {
    // The mounted app keeps its own copy of the files.
    unload(path);
  }
}

// Assigned rather than added, so a reloaded module replaces its listener.
window.onmessage = (event: MessageEvent<Render>) => {
  if (event.origin !== location.origin || event.source !== parent) return;

  const { id } = event.data;

  try {
    render(event.data);
    parent.postMessage({ type: "mounted", id }, location.origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    parent.postMessage({ type: "error", id, message }, location.origin);
  }
};

parent.postMessage({ type: "ready" }, location.origin);
