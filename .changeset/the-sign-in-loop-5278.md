---
"a11ign": patch
---

The sign-in loop presses the app's own "Sign in" button on a signed-out page that asks for nothing, so the login reaches the identity provider instead of ending `unknown-screen` (#5278). A page with two sign-in buttons is still not pressed.
