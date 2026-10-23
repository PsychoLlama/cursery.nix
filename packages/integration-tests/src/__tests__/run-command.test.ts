import * as cursery from "cursery";

import { load, mount, nix } from "../testing.ts";

/** Evaluates `code` with `io` in scope. */
function evaluate(code: string) {
  return cursery.evaluate(nix`let io = import <web/io>; in ${code}`);
}

/**
 * Loads and mounts an app with `html`, `io`, and `log` (dispatching a `log`
 * action) in scope, logging payloads into a `<pre>` around the button
 * `button` renders.
 */
function render(button: string) {
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
        render = state: [ (html.pre (builtins.toJSON state)) (${button}) ];
      }`,
    }),
  );
  const { container } = resources.use(mount(path));
  const owned = resources.move();

  return {
    /** Clicks the button. */
    click: () => container.querySelector("button")!.click(),

    /** The payloads logged. */
    logged: () =>
      JSON.parse(container.querySelector("pre")!.textContent!) as unknown,

    [Symbol.dispose]: () => owned.dispose(),
  };
}

/** Clicks a button running `handler`, returning the payloads it logged. */
function logs(handler: string) {
  using view = render(nix`html.button { on.click = event: ${handler}; }`);
  view.click();
  return view.logged();
}

/** Clicks a button running `handler`, returning the console errors. */
function errors(handler: string) {
  using error = vi.spyOn(console, "error").mockImplementation(() => {});
  using view = render(nix`html.button { on.click = event: ${handler}; }`);
  view.click();
  return error.mock.calls.map(([message]) => String(message));
}

/** Clicks a button running `command`, returning the payload `$out` logs. */
const output = (command: string) =>
  logs(nix`io.map (out: log out) (${command})`);

declare global {
  /** What scripts ran, for scripts to push to. */
  var ran: unknown[] | undefined;
}

describe("runCommand", () => {
  afterEach(() => {
    globalThis.ran = undefined;
  });

  it("describes an effect", () => {
    expect(evaluate(nix`io.runCommand "hi" { n = 1; } "$out = 1;"`)).toEqual({
      _type: "effect",
      kind: "runCommand",
      inputs: { name: "hi", env: { n: 1 }, script: "$out = 1;" },
    });
  });

  it("outputs `$out`", () => {
    expect(
      output(nix`io.runCommand "out" { } ''
        $out = { list: [1, 2.5, "three", true, null] };
      ''`),
    ).toEqual([{ list: [1, 2.5, "three", true, null] }]);
  });

  it("outputs null without `$out`", () => {
    expect(output(nix`io.runCommand "none" { } ""`)).toEqual([null]);
  });

  it("converts `$out` as JSON does", () => {
    expect(
      output(nix`io.runCommand "json" { } ''
        $out = { gone: undefined, date: new Date(0), list: [undefined] };
      ''`),
    ).toEqual([{ date: "1970-01-01T00:00:00.000Z", list: [null] }]);
  });

  it("passes `env` as `$<name>`", () => {
    expect(
      output(nix`io.runCommand "env" {
        count = 3;
        attrs = { list = [ "a" ]; };
      } ''
        $out = [$count * 2, $attrs.list[0]];
      ''`),
    ).toEqual([[6, "a"]]);
  });

  it("runs when returned from a handler", () => {
    using view = render(
      nix`html.button { on.click = event: io.runCommand "push" { } "(globalThis.ran ??= []).push(1)"; }`,
    );

    view.click();
    view.click();

    expect(globalThis.ran).toEqual([1, 1]);
  });

  it("runs the same command each time", () => {
    expect(
      logs(nix`let
        count = io.runCommand "count" { } "$out = (globalThis.ran ??= []).push(1);";
      in
      io.map (outputs: log outputs) (io.all [ count count ])`),
    ).toEqual([[1, 2]]);
  });

  it("tells commands apart by their env", () => {
    logs(nix`let
      push = value: io.runCommand "push" { inherit value; } "(globalThis.ran ??= []).push($value);";
    in
    io.all [ (push 1) (push 2) ]`);

    expect(globalThis.ran).toEqual([1, 2]);
  });

  it("fails catchably", () => {
    expect(
      logs(
        nix`io.catch (error: log error.message) (io.runCommand "fail" { } "throw new Error('nope')")`,
      ),
    ).toEqual(['Command "fail" failed: Error: nope']);
  });

  describe("errors", () => {
    it("reports thrown errors, naming the command", () => {
      expect(
        errors(nix`io.runCommand "fail" { } "throw new Error('nope')"`),
      ).toEqual([expect.stringMatching(/Command "fail" failed: Error: nope/)]);
    });

    it("reports syntax errors", () => {
      expect(errors(nix`io.runCommand "bad" { } "$out = ;"`)).toEqual([
        expect.stringMatching(/SyntaxError/),
      ]);
    });

    it("rejects promises", () => {
      expect(
        errors(nix`io.runCommand "async" { } "$out = Promise.resolve(1);"`),
      ).toEqual([expect.stringMatching(/can't be a promise/)]);
    });

    it("rejects env names that aren't identifiers", () => {
      expect(errors(nix`io.runCommand "env" { "a-b" = 1; } ""`)).toEqual([
        expect.stringMatching(/Invalid env "a-b"/),
      ]);
      expect(errors(nix`io.runCommand "env" { out = 1; } ""`)).toEqual([
        expect.stringMatching(/other than `out`/),
      ]);
    });

    it("validates arguments", () => {
      expect(() => evaluate(nix`io.runCommand 1 { } ""`)).toThrow(
        /Invalid command name of type int/,
      );
      expect(() => evaluate(nix`io.runCommand "env" [ ] ""`)).toThrow(
        /Invalid env of type list/,
      );
      expect(() => evaluate(nix`io.runCommand "env" { } 1`)).toThrow(
        /Invalid script of type int/,
      );
    });
  });
});
