// The tool is reached through what it DECLARES (#3534, #4408): `toolExport("<declared subpath>")` in `scripts/agent-org-newest-tag.mjs`, a computed `import()`
// that TypeScript types as `Promise<any>`, so no `declare module` is needed any more and the one that stood here for `agent-org/src/*` is gone.

// What a callback parameter is when its callee came from `toolExport`: TS7006 otherwise, since `any` gives it no contextual type.
// One named, justified `any` instead of 180 anonymous ones -- it is exactly the type `toolExport` already gives every import.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedTool = any;
