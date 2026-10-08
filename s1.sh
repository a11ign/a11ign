node -e '
  const i = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).capture?.interaction ?? {};
  const pressed = (i.formChanges ?? []).filter((c) => c.kind !== "route");
  console.log("probe-forms presses: " + pressed.length);
  if (pressed.length === 0) { console.error("::error::probe-forms: \"true\" pressed nothing, so run 3\u0027s zero proves nothing"); process.exit(1); }
' "${{ steps.witness.outputs.result-json }}"
