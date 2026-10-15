Row #5493: the screen loop never presses a provider-named control as the form's submit (the a11ign copy). A control whose name names an identity provider (`Continue with Google`, `Sign in with Apple`, `… with Microsoft`, `… with GitHub`, `… with Facebook`) is never a typed form's submit, and when several candidates share no exact name (`Continue`, `Log in`, `Sign in`) the typed form is `ambiguous` instead of pressing the first by page order. The sibling copy in the worker is a11ign#5494.

Acceptance:
grep -q "Continue with Google" packages/cli/src/auth/screen-loop.test.ts && node packages/guards/src/assert-glob-not-empty.ts "packages/cli/src/auth/screen-loop.test.ts" --min=1 --run --runner=rstest
