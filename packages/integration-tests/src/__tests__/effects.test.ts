import { load, mount, nix } from "../testing.ts";

/**
 * Mounts an app rendering `buttons`, with `io` and `log` (dispatching a
 * `log` action) in scope. Logged payloads show in a `<pre>`.
 */
function render(buttons: string) {
  using resources = new DisposableStack();
  const { path } = resources.use(
    load({
      "default.nix": nix`let
        inherit (import <web/dom>) html;
        io = import <web/io>;
        log = io.dispatch "log";
      in {
        init = [ ];
        update = state: action: state ++ [ action.payload ];
        render = state: [ (html.pre (builtins.toJSON state)) ] ++ ${buttons};
      }`,
    }),
  );
  const { container } = resources.use(mount(path));
  const owned = resources.move();

  return {
    /**
     * Clicks the button matching `selector`, returning whether the default
     * was prevented and the console errors.
     */
    click: (selector = "button") => {
      using error = vi.spyOn(console, "error").mockImplementation(() => {});
      const event = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      });
      container.querySelector(selector)!.dispatchEvent(event);
      return {
        prevented: event.defaultPrevented,
        errors: error.mock.calls.map(([message]) => String(message)),
      };
    },

    /** The payloads logged. */
    logged: () =>
      JSON.parse(container.querySelector("pre")!.textContent!) as unknown,

    [Symbol.dispose]: () => owned.dispose(),
  };
}

/** A button running `handler` on click. */
const button = (handler: string) =>
  nix`[ (html.button { on.click = event: ${handler}; }) ]`;

describe("effects", () => {
  it("hides the event's `__id`", () => {
    using view = render(button(nix`log (event ? __id)`));

    view.click();

    expect(view.logged()).toEqual([false]);
  });

  it("fails when its inputs throw", () => {
    using view = render(
      button(nix`{
        _type = "effect";
        kind = "preventDefault";
        inputs.event = throw "boom";
      }`),
    );

    expect(view.click().errors).toEqual([expect.stringMatching(/boom/)]);
  });

  it("reports unknown kinds", () => {
    using view = render(
      button(nix`{ _type = "effect"; kind = "missing"; inputs = { }; }`),
    );

    expect(view.click().errors).toEqual([
      expect.stringMatching(/Unknown effect "missing"/),
    ]);
  });

  describe("preventDefault", () => {
    it("prevents the default when returned", () => {
      using view = render(button(nix`event.preventDefault`));

      expect(view.click()).toEqual({ prevented: true, errors: [] });
    });

    it("only describes the effect until returned", () => {
      using view = render(button(nix`log event.preventDefault._type`));

      expect(view.click().prevented).toBe(false);
      expect(view.logged()).toEqual(["effect"]);
    });

    it("outputs null", () => {
      using view = render(
        button(nix`io.map (output: log output) event.preventDefault`),
      );

      expect(view.click().prevented).toBe(true);
      expect(view.logged()).toEqual([null]);
    });

    it("fails on events that finished dispatching", () => {
      using view = render(nix`[
        (html.button { id = "keep"; on.click = event: log event.preventDefault; })
        (html.button { id = "run"; on.click = event: builtins.head state; })
      ]`);

      view.click("#keep");

      expect(view.click("#run")).toEqual({
        prevented: false,
        errors: [
          expect.stringMatching(
            /Cannot preventDefault: event \d+ finished dispatching/,
          ),
        ],
      });
    });

    it("reports invalid events", () => {
      const prevent = (inputs: string) => {
        using view = render(
          button(
            nix`{ _type = "effect"; kind = "preventDefault"; inputs = ${inputs}; }`,
          ),
        );
        return view.click().errors;
      };

      expect(prevent(nix`{ }`)).toEqual([
        expect.stringMatching(/Cannot preventDefault without an event/),
      ]);
      expect(prevent(nix`{ event = "nope"; }`)).toEqual([
        expect.stringMatching(
          /`event` is "nope", which is not an event's `__id`/,
        ),
      ]);
      expect(prevent(nix`{ event = 1000000; }`)).toEqual([
        expect.stringMatching(/which is not an event's `__id`/),
      ]);
    });
  });
});
