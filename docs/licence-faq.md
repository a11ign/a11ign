# Licence FAQ — running a11ign in CI against your own app

**This is a description of the licence text, not legal advice; ask your own counsel for your case.**

a11ign is licensed under the **GNU Affero General Public License v3.0 or later** (`AGPL-3.0-or-later`); the whole text is
[`LICENSE`](../LICENSE). This page answers the questions an evaluator asks first. Each answer **quotes** the licence — the
block quotes headed `LICENSE §n` are copied from `LICENSE` word for word, and `licence-faq.test.ts` fails if one is not —
and says no more than the quotation does. Where the answer turns on how the words apply to your situation, that is the
question for your counsel, and this page says so.

## 1. May I run an unmodified a11ign (the Action or the CLI) in CI against my own app?

The licence addresses running the unmodified program directly:

> **LICENSE §2:** This License explicitly affirms your unlimited permission to run the unmodified Program.

Running it in CI is running it. Nothing in the quotation asks you to publish anything, notify anyone or hold a
commercial licence for that.

What the run produces is addressed in the same section:

> **LICENSE §2:** The output from running a covered work is covered by this License only if the output, given its content, constitutes a covered work.

Whether a given report or `result.json` is a "covered work" is a question about its content, and is for your counsel.

## 2. What does section 13 of the AGPL ask, and of whom?

Section 13 is the "network" clause. In its own words:

> **LICENSE §13:** Notwithstanding any other provision of this License, if you modify the Program, your modified version must prominently offer all users interacting with it remotely through a computer network (if your version supports such interaction) an opportunity to receive the Corresponding Source of your version by providing access to the Corresponding Source from a network server at no charge, through some standard or customary means of facilitating copying of software.

It is addressed to **someone who modifies the Program** ("if you modify the Program"), and it asks that person to offer the
Corresponding Source of **their modified version** to the users who interact with that version remotely over a network.
Its condition begins with modification, so section 1's unmodified run is not within it.

The licence defines "modify":

> **LICENSE §0:** To "modify" a work means to copy from or adapt all or part of the work in a fashion requiring copyright permission, other than the making of an exact copy.

## 3. May I modify a11ign and run it only inside my organisation?

Two passages bear on it. The first covers copies you make and run but do not hand to anyone:

> **LICENSE §2:** You may make, run and propagate covered works that you do not convey, without conditions so long as your license otherwise remains in force.

and "convey" is defined as:

> **LICENSE §0:** To "convey" a work means any kind of propagation that enables other parties to make or receive copies.  Mere interaction with a user through a computer network, with no transfer of a copy, is not conveying.

The second is section 13, quoted in answer 2: it applies to a modified version that "supports such interaction" with
"users interacting with it remotely through a computer network". Whether the people in your organisation who use your
modified copy are such users, and whether your modified version supports such interaction at all, is the question this
page cannot answer for you; it is for your counsel.

Having a contractor or a service provider make modifications, or run the program, for you is addressed separately:

> **LICENSE §2:** You may convey covered works to others for the sole purpose of having them make modifications exclusively for you, or provide you with facilities for running those works, provided that you comply with the terms of this License in conveying all material for which you do not control copyright.

## 4. Are all the packages under the same licence?

No. Two packages carry other licences, and the split is deliberate. Only `evidence` is in this repository; `nvda-speech` moved to another one:

| package | licence | where to read it |
|---|---|---|
| `evidence` | **Apache-2.0** | [`packages/evidence/LICENSE`](../packages/evidence/LICENSE) and the `license` field of its `package.json`. Its wire types and pure predicates can be embedded in other people's code. |
| `nvda-speech` | **GPL-3.0-or-later** | Derived from NVDA's own GPL-licensed code, so it carries the GPL. It does not publish, and it now lives in the `a11ign/screenreader-worker` repository (`packages/nvda-speech/`), not in this one. |

The split is recorded in [`packages/README.md`](../packages/README.md), which is the authority for it. Every package in this
repository other than `evidence` is `AGPL-3.0-or-later`, as its own `package.json` says.

The AGPL itself speaks to combining a covered work with a GPL version 3 work:

> **LICENSE §13:** Notwithstanding any other provision of this License, you have permission to link or combine any covered work with a work licensed under version 3 of the GNU General Public License into a single combined work, and to convey the resulting work.

## 5. Is there a commercial licence?

The README's sentence, unchanged:

> If the AGPL does not fit — embedding in a closed-source product, or a proprietary hosted service — a separate commercial licence is available; open an issue to start the conversation.

The README's [Licence section](../README.md#licence) also records that no commercial licence is offered at first publish.
