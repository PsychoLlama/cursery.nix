import { load, mount, unload } from "cursery";

const files = import.meta.glob<string>("./**/*.nix", {
  query: "?raw",
  import: "default",
  eager: true,
});

// Editing a Nix file re-runs this module, and mounting into the same
// container patches the DOM and keeps state. Accepted first, so an app that
// fails to mount still reloads once fixed.
import.meta.hot?.accept();

const container = document.getElementById("app")!;
const path = load(files);
try {
  mount(container, path);
} finally {
  // The mounted app keeps its own copy of the files.
  unload(path);
}
