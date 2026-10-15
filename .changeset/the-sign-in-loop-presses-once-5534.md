---
"a11ign": patch
---

The sign-in loop presses the app's own `Sign in` once per login. A landing page that returns after the provider's forms is the app's callback while its SDK exchanges the code, and pressing it again started a second login on top of the first (the Auth0 end-to-end run ended `signed-in-check-never-matched`). The loop now waits on it, and the signed-in check or the budget answers.
