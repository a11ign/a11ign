// The tool is a pinned dependency (#2975), imported as `agent-org/src/<module>.mjs`. TypeScript will not read the JSDoc types of a `.mjs` that
// sits in `node_modules` unless `maxNodeModuleJsDepth` is raised, and measured at 2 that stops at the first file whose own relative import
// is one `node_modules` deeper (`lib/leak-patterns.mjs` -> `./generic-leak-patterns.mjs`, TS7016 inside the dependency): the depth is the length
// of the tool's longest import chain, not a number to pick. So the tool's modules are declared here as untyped (`any`), which is what a
// dependency that ships no declarations is, and a caller annotates the shape it relies on.
declare module "agent-org/src/*";

// What a callback parameter is when its callee is one of the untyped modules above: TS7006 otherwise, since `any` gives it no contextual type.
// One named, justified `any` instead of 180 anonymous ones -- it is exactly the type the declaration above already gives every import.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedTool = any;
