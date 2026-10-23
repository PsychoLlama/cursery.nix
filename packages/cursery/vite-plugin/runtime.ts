/**
 * Runs in the browser, behind each `.nix` import (see `index.ts`).
 */

import { load, mount, type MountOptions, unload, unmount } from "cursery";

export interface App {
  /**
   * Renders the app into `container` with `options`, keeping it up to date
   * with edits. Returns a function that unmounts it.
   *
   * @throws If the app fails to mount. See `mount` from `cursery`.
   */
  mount(container: Element, options?: MountOptions): () => void;
}

/** Kept across versions of a module. */
interface Shared {
  files?: Record<string, string>;
  containers?: Map<Element, MountOptions | undefined>;
}

/** The part of `import.meta.hot` used here. */
export interface Hot {
  data: Shared;
}

/**
 * The app at `entry`, a path in `files`.
 *
 * Every version of the module calls this. The latest one's files are used
 * everywhere, and containers mounted by earlier versions are mounted again.
 */
export function app(
  files: Record<string, string>,
  entry: string,
  hot?: Hot,
): App {
  const shared: Shared = hot?.data ?? {};
  shared.files = files;
  const containers = (shared.containers ??= new Map());

  const render = (container: Element, options?: MountOptions) => {
    const path = load(shared.files ?? files);

    try {
      mount(container, `${path}/${entry}`, options);
    } finally {
      // The mounted app keeps its own copy of the files.
      unload(path);
    }
  };

  for (const [container, options] of containers) {
    try {
      render(container, options);
    } catch (error) {
      // Keeps the last working version until the next edit.
      console.error(error);
    }
  }

  return {
    mount(container, options) {
      render(container, options);
      containers.set(container, options);

      return () => {
        containers.delete(container);
        unmount(container);
      };
    },
  };
}
