import app from "./src/default.nix";

app.mount(document.getElementById("app")!, {
  effects: {
    focus: (id: string) => document.getElementById(id)!.focus(),
  },
});
