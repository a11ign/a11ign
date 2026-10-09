# Release policy: which version to pin, what a number means, where the changelog is

For someone who installs `a11ign` or uses the Action and wants their CI to stop moving under them. The mechanism
is `.github/workflows/release.yml`, whose header is the authority; this page is what an adopter needs from it.

## Channels

Two npm dist-tags, and **`latest` is the stable one**.

| channel | what moves it | use it when |
|---|---|---|
| `latest` | **the fleet's qualification** (#3136) being green for the SHA a version was released on. It stays on the last qualified version when the verdict is red, which is the rollback by construction, and it never moves backwards. | you want the newest version that has passed a real screen-reader run. This is what `npx a11ign` runs. |
| `next` | **every push to `main` that carries a changeset.** Pre-merge CI and the release guards are its gate; the fleet's verdict does not gate it. | you need a change that is published and not yet qualified. |

Read both with `npm view a11ign dist-tags`. When `latest` is behind `next`, that version is waiting for its qualification
or failed it; a failure files a public row. On a day when several changesets merge, `next` can be several versions ahead
(0.5.0 to 0.5.4 were published in about ten hours on 2026-10-09).

**The Action follows the same promotion.** `a11ign/a11ign@v0` is the Action's major tag and moves only when a version is
promoted to `latest`. Even so, **pin the Action by the full commit SHA of a release, as the README's quickstart does.**
`v0` is a moving tag across every promoted 0.x release, and under the rule below a 0.x minor may break an input or a
default (0.4.0 flipped `probe-forms`), so `@v0` changes your CI whenever a release is promoted. A SHA changes it only
when you edit the line. The commit of release `x.y.z` is the one tag `a11ign@x.y.z` points at.

## Version numbers

**While `a11ign` is 0.x, a breaking change to a flag, an output field or an input or default of the Action is a minor
and its changeset opens with a `**Migration**` note saying what to change; a new flag, output or input that breaks
nothing is also a minor; a fix, and a release that only moves dependencies or documentation, is a patch.**

- This is semver's own reading of 0.x ("before 1.0, breaking is a minor", `.changeset/README.md`, #1396), made specific
  to the surfaces an adopter's CI touches. At 1.0 the same changes become a major.
- Wording of a message or a summary line is not an output field: `--json`, the evidence pack and the Action's declared
  outputs are. A change to prose a person reads is a patch; one a script parses is not prose.
- `@a11ign/scorer` has its own, stricter rule (any retrain or threshold change is breaking, because the weights are its
  API), in `.changeset/README.md`. It does not change what `a11ign`'s number means.
- The `**Migration**` label is new with this page. No release below carries it by that name; the two breaking ones say
  the same thing in their own words, and the label is asked of changesets written from here on.

### The rule against the last ten `a11ign` releases

Read on 2026-10-09 from each release's notes (`gh release view a11ign@<version>`), which print the changeset sentences
verbatim. The rule is applied as written above and **is not retrofitted**: where it disagrees with what was published,
the row says so.

| release | what its notes say changed | published as | the rule says | agrees |
|---|---|---|---|---|
| `a11ign@0.5.4` | only dependency bumps (`@a11ign/scorer` 0.3.3, `@a11ign/judge` 0.5.1) | patch | patch | yes |
| `a11ign@0.5.3` | a multi-page run's Action summary gains a "left to a person on N of M pages" line; `--json` and the evidence pack unchanged | patch | patch: a prose line, no field | yes, and the nearest to a judgement call: it is a visible addition, but nothing parses it |
| `a11ign@0.5.2` | only dependency bumps | patch | patch | yes |
| `a11ign@0.5.1` | only dependency bumps | patch | patch | yes |
| `a11ign@0.5.0` | adds `--evidence-pack` to the CLI and an `evidence-pack` output to the Action | minor | minor: an added flag and output | yes |
| `a11ign@0.4.1` | the Action passes every input through `env:` (script-injection fix); a multi-line `urls` now scans every page, where it scanned the first and reported success | patch | patch: both are fixes | yes. The second does make an existing workflow scan more pages, but it makes the documented input do what it said |
| `a11ign@0.4.0` | the Action's `probe-forms` default becomes `false`; new `idp-origins` in a flows file; the summary names the WCAG 2.2 criteria not covered | minor | minor: a changed input default | yes. Its notes say what to set to keep the old behaviour, without the `Migration` label |
| `a11ign@0.3.2` | the README states a measured time | patch | patch: documentation | yes |
| `a11ign@0.3.1` | the wording of the `auth-login-failed` remediation text | patch | patch: prose | yes |
| `a11ign@0.3.0` | `exports` and `bin` move from `.js` to `.mjs`; a deep import of `dist/<file>.js` stops resolving; the CLI becomes one bundle | minor | minor: a changed entry point | yes. Its notes name the break and no step to take |

**Mis-sized: none of the ten.** Three observations the table cannot show: the rule is silent about an added flag in
its first form, and 0.5.0 was already a minor, which is why the additive clause is written in; 0.4.0 and 0.3.0 each put
one breaking change in a note with several unrelated ones, so an adopter must read the whole note to find it, which is
what the `Migration` label is for; and the ten releases span two days (2026-10-07 to 2026-10-09), so they test the rule
on a quick sequence of small changes, not on a long-lived one.

## Changelog

**The changelog is the GitHub Release for the tag**, at
[github.com/a11ign/a11ign/releases](https://github.com/a11ign/a11ign/releases), one per `a11ign@<version>`. It carries the
changeset sentences, and a `Promoted to latest: <time>` line once the version is on `latest`.

**The `CHANGELOG.md` inside each package is not it.** A release is versioned on a detached commit that no branch holds,
so `main` is never written and its `CHANGELOG.md` files lag the last tag by design: `packages/cli/CHANGELOG.md` ends at
`0.2.7` while `a11ign@0.5.4` is published. The npm page shows the README, not a changelog; follow the link from there.
