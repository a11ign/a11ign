---
---

The auth spike's two entry guards (`attach-spike.ts` and the cross-origin IdP fixture) compare the realpath of `argv[1]`, so a script launched through a symlink still runs its `main` block, and control's entry-points ratchet no longer refuses them (#4578). Neither file is in the published build (`packages/cli/tsconfig.json` excludes both), so no published package changes.
