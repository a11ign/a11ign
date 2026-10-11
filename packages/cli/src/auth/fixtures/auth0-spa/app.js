// THE TEST PAGE'S SCRIPT (#4973, #4084 outcome 1): signs in through Auth0 Universal Login and keeps the token ONLY in page memory.
//
// It reproduces the adopter's shape (the SDK's in-memory cache, set below), so a reload signs the user out and this file writes
// nothing to browser storage. (The SDK keeps its short-lived redirect transaction in a cookie while the user is at the tenant; that is
// the SDK's, and it is not the token.) The tenant's domain and client id are not here: `serve.ts` injects them into `index.html`.
//
// WHAT THIS PAGE DOES NOT PROVE: the Auth0 round trip is not run by this row. It needs the tenant and is the end-to-end row's.
/* global document, window, auth0 */
(async function main() {
  const config = JSON.parse(document.getElementById("auth0-config").textContent);
  const heading = document.getElementById("heading");
  const signIn = document.getElementById("sign-in");
  const signOut = document.getElementById("sign-out");

  const client = await auth0.createAuth0Client({
    domain: config.domain,
    clientId: config.clientId,
    cacheLocation: 'memory',
    authorizationParams: { redirect_uri: window.location.origin },
  });

  const returning = new URLSearchParams(window.location.search);
  if (returning.has("code") && returning.has("state")) {
    await client.handleRedirectCallback();
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  if (await client.isAuthenticated()) {
    heading.textContent = "Signed in to the a11y-witness test page";
    signIn.hidden = true;
    signOut.hidden = false;
  } else {
    heading.textContent = "Sign in required";
  }

  signIn.addEventListener("click", () => client.loginWithRedirect());
  signOut.addEventListener("click", () => client.logout({ logoutParams: { returnTo: window.location.origin } }));
})();
