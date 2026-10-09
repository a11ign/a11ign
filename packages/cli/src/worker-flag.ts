/**
 * What `witness --worker <value>` makes of its value (#4593).
 *
 * Its own module so a test can import it without `cli.ts`, which reaches the corpus (`cli.ts:914`) and would
 * put the corpus closure under `worker-flag.test.ts`. It imports only `@a11ign/screenreader-fleet`.
 *
 * `leaseWorker` uses a named worker "as-is", so a value that is not an address (`http://:8765`, the shape of the
 * 29-minute incident `assertWorkerUrl` exists for) reached the capture unchecked. The fleet layer's own
 * validator refuses it here, before anything is leased or captured, so the CLI and the fleet agree on what an
 * address is. A missing value (`--worker` last on the line) is refused too, never kept as the default: the
 * operator named a worker and the run would go to a different one.
 */
import { assertWorkerUrl } from "@a11ign/screenreader-fleet/worker-http";

export function workerFlagValue(value: string | undefined): string {
  return assertWorkerUrl(value, { source: "--worker" });
}
