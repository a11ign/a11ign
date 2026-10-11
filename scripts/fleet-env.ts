// `pnpm run fleet:env`: the control plane's inventory as `A11Y_WORKERS` (`eval "$(pnpm run --silent fleet:env)"`), or one URL a
// line with `--list`. ADR 0045 cut 4 (#5082): the command used to start the fleet's laid `src/fleet-env.ts`, from the fleet's
// repository; it now imports the functions the package EXPORTS (`@a11ign/screenreader-fleet/fleet-env`), which has no bin.
//
// WHY NOT `node node_modules/@a11ign/screenreader-fleet/dist/fleet-env.mjs`: that file's entry guard compares `import.meta.url`
// with `process.argv[1]` WITHOUT resolving the `node_modules` symlink, so `main()` never ran and the command printed nothing and
// exited 0 (measured at 0.9.0). An empty `export A11Y_WORKERS=` that `eval` accepts is the silent wrong answer the package's own
// header says it exists to prevent. The inventory is the control plane's, so the default paths are named here and not in the package.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fleetEnvOutput, inventoryPathsFor, portFromGroupVars } from "@a11ign/screenreader-fleet/fleet-env";
import { refuseUnknownFlags } from "./cli-flags.ts";

const ANSIBLE = fileURLToPath(new URL("../packages/control/ansible/", import.meta.url));
const KNOWN_FLAGS = ["--list", "--inventory=", "--group-vars="];
const EXIT_USAGE = 2;

/** The caller's flags, plus the control plane's file for each of the two the caller did not name. */
function withDefaultFiles(argv: string[]): string[] {
  const named = (flag: string) => argv.some((argument) => argument.startsWith(`--${flag}=`));
  return [
    ...argv,
    ...(named("inventory") ? [] : [`--inventory=${ANSIBLE}inventory.yml`]),
    ...(named("group-vars") ? [] : [`--group-vars=${ANSIBLE}group_vars/a11y_workers.yml`]),
  ];
}

function main() {
  const argv = process.argv.slice(2);
  refuseUnknownFlags(KNOWN_FLAGS, { entry: import.meta.url, argv, command: "npm run fleet:env" });
  let paths;
  try {
    paths = inventoryPathsFor({ argv: withDefaultFiles(argv) });
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exitCode = EXIT_USAGE;
    return;
  }
  const { stdout, stderr } = fleetEnvOutput(readFileSync(paths.inventoryPath, "utf8"), {
    port: portFromGroupVars(readFileSync(paths.groupVarsPath, "utf8")),
    mode: argv.includes("--list") ? "list" : "env",
  });
  process.stderr.write(stderr);
  process.stdout.write(stdout);
}

main();
