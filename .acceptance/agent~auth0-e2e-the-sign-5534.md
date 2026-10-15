Row #5534: the screen loop presses the app's own `Sign in` once per login (the a11ign copy, the specification). A `landing` that returns after the provider's forms is the app's callback page while its SDK exchanges the code (`Sign in required` with the button visible), and pressing it starts a second login on top of the first. The worker's copy, which the capture's login runs, is a11ign#5535; the row's own Acceptance (a green normal dispatch) is hand-run after that releases.

Acceptance:
grep -q "a11ign#5534" packages/cli/src/auth/screen-loop.test.ts && node packages/guards/src/assert-glob-not-empty.ts "packages/cli/src/auth/screen-loop.test.ts" --min=1 --run --runner=rstest

Mutation: (1) `landingAlreadyPressed` always false — caught by the two a11ign#5534 cases; (2) always true — caught by the landing positive control, the unchanged-landing case and both a11ign#5534 cases. Each file restored byte-identical and diffed.
