import * as cursery from "cursery";

import { nix } from "../testing.ts";

/** Evaluates `code` with `io` in scope. */
function evaluate(code: string) {
  return cursery.evaluate(nix`let io = import <web/io>; in ${code}`);
}

describe("dispatch", () => {
  it("returns a derivation", () => {
    expect(
      evaluate(nix`let drv = io.dispatch "increment"; in {
        inherit (drv) type name builder action;
        isFunctor = drv ? __functor;
      }`),
    ).toEqual({
      type: "derivation",
      name: "dispatch",
      builder: "builtin:dispatch",
      action: "increment",
      isFunctor: true,
    });
  });

  it("sets the payload when called", () => {
    expect(
      evaluate(nix`let drv = io.dispatch "add" { text = "milk"; }; in {
        inherit (drv) type action passthru;
        isFunctor = drv ? __functor;
      }`),
    ).toEqual({
      type: "derivation",
      action: "add",
      passthru: { payload: { text: "milk" } },
      isFunctor: false,
    });
  });

  it("hashes the action into the output path, but not the payload", () => {
    expect(
      evaluate(nix`let out = drv: drv.outPath; in {
        same = out (io.dispatch "a") == out (io.dispatch "a");
        type = out (io.dispatch "a") != out (io.dispatch "b");
        payload = out (io.dispatch "a" 1) == out (io.dispatch "a" 2);
        unset = out (io.dispatch "a") == out (io.dispatch "a" null);
      }`),
    ).toEqual({ same: true, type: true, payload: true, unset: true });
  });

  it("keeps the payload as a Nix value", () => {
    expect(
      evaluate(nix`(io.dispatch "call" (x: x + 1)).passthru.payload 1`),
    ).toBe(2);
  });

  it("validates the type", () => {
    expect(() => evaluate(nix`io.dispatch 1`)).toThrow(
      /Invalid action type of type int: expected a string/,
    );
  });
});
