// `pnpm run fleet:env`: the control plane's inventory as `A11Y_WORKERS`, or one URL a line with `--list`. The two files it reads are
// control's and are NAMED BY THE CALLER (`--inventory=<file> --group-vars=<file>`), because a repository never reads another's tree (ADR 0045
// Decision 1 rule 2, cut 8, #5086): the command used to default them to the laid copy of control's `ansible/`, which the core no longer lays.
// ADR 0045 cut 4 (#5082): the command used to start the fleet's laid `src/fleet-env.ts`, from the fleet's
// repository; it now imports the functions the package EXPORTS (`@a11ign/screenreader-fleet/fleet-env`), which has no bin.
//
// WHY NOT `node node_modules/@a11ign/screenreader-fleet/dist/fleet-env.mjs`: that file's entry guard compares `import.meta.url`
// with `process.argv[1]` WITHOUT resolving the `node_modules` symlink, so `main()` never ran and the command printed nothing and
// exited 0 (measured at 0.9.0). An empty `export A11Y_WORKERS=` that `eval` accepts is the silent wrong answer the package's own
// header says it exists to prevent. The inventory is the control plane's, so its files are named by the caller and not by the package.
import { readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { fleetEnvOutput, inventoryPathsFor, portFromGroupVars } from "@a11ign/screenreader-fleet/fleet-env";
import { refuseUnknownFlags } from "./cli-flags.ts";

const KNOWN_FLAGS = ["--list", "--inventory=", "--group-vars="];
const REQUIRED_FILE_FLAGS = ["inventory", "group-vars"];
const EXIT_USAGE = 2;

/** The file flags the caller did not name. The package's own fallback is a monorepo layout this repository no longer has, so the refusal is made here, in words. */
function unnamedFileFlags(argv: string[]): string[] {
  return REQUIRED_FILE_FLAGS.filter((flag) => !argv.some((argument) => argument.startsWith(`--${flag}=`)));
}

function main() {
  const argv = process.argv.slice(2);
  refuseUnknownFlags(KNOWN_FLAGS, { entry: import.meta.url, argv, command: "npm run fleet:env" });
  const unnamed = unnamedFileFlags(argv);
  if (unnamed.length > 0) {
    process.stderr.write(`fleet:env: control's inventory is named by the caller, and ${unnamed.map((flag) => `--${flag}=<file>`).join(" and ")} ${unnamed.length > 1 ? "were" : "was"} not passed.\n`);
    process.exitCode = EXIT_USAGE;
    return;
  }
  let paths;
  try {
    paths = inventoryPathsFor({ argv });
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

// Importing this file must not run the command. The realpath is the part that matters: a `node_modules/.bin` symlink reaches it under a
// name `import.meta.url` does not resolve through, and the plain comparison then skips `main()` and exits 0 with no output.
if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) main();
