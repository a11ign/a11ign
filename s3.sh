path="${{ steps.default.outputs.result-json }}"
test -s "$path" || { echo "::error::the default run produced no result-json" >&2; exit 1; }
node -e '
  const i = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).capture?.interaction ?? {};
  const pressed = (i.formChanges ?? []).filter((c) => c.kind !== "route");
  const routes = (i.formChanges ?? []).length - pressed.length;
  console.log("probe-forms presses: " + pressed.length + "; first links followed: " + routes + "; disclosures pressed: " + (i.stateChanges ?? []).length);
  if (pressed.length !== 0) { console.error("::error::a default run pressed " + pressed.length + " control(s) probe-forms owns: " + pressed.map((c) => c.control + " [" + c.kind + "]").join("; ")); process.exit(1); }
' "$path"
