/** The demo's editor and the playground frame rendering it. */
const editor = () =>
  document.getElementById("demo-source") as HTMLTextAreaElement;
const frame = () =>
  document.getElementById("demo-preview") as HTMLIFrameElement;

/** Renders, by request id, waiting on the frame's answer. */
const pending = new Map<number, (error: string | null) => void>();
let next = 0;

/** Skips the notes leading up to the error, which are mostly the runtime's. */
function trim(message: string) {
  const start = message.search(/^error/m);
  return start === -1 ? message : message.slice(start);
}

function render(source: string): Promise<string | null> {
  const id = next++;
  const files = { "default.nix": source };
  frame().contentWindow!.postMessage({ id, files }, location.origin);

  return new Promise((resolve) => pending.set(id, resolve));
}

// Assigned rather than added, so a reloaded module replaces its listener.
window.onmessage = (event) => {
  if (event.origin !== location.origin) return;
  if (event.source !== frame().contentWindow) return;

  const { type, id, message } = event.data;

  if (type === "ready") {
    // Renders sent before the frame was listening were dropped. The editor
    // has the latest source, edited or not.
    for (const resolve of pending.values()) resolve(null);
    pending.clear();
    render(editor().value);
  } else {
    pending.get(id)?.(type === "error" ? trim(message) : null);
    pending.delete(id);
  }
};

export default {
  copy: (text: string) => navigator.clipboard.writeText(text),
  sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),

  /** Renders `source` in the frame, resolving to its error, or `null`. */
  preview: render,
};
