# Chairman messaging

The organisation needed a way to tell its chairman things (a request waiting on them, a stall, an incident, a daily summary)
and to hear back, without the chairman watching a terminal or a GitHub notification list. The answer is an optional chat
channel, Telegram first. **It is off unless this project opts in**, and four commands in this checkout's `package.json` are the
whole of its surface. This page says what each is for, so a maintainer who meets the name can tell whether it is theirs to run.

The tool lives in [a11ign/agent-org](https://github.com/a11ign/agent-org), where the commands are implemented and the design is
written down in its [`docs/messaging.md`](https://github.com/a11ign/agent-org/blob/main/docs/messaging.md). That is the source of
truth, and this page does not copy it: read the decisions (identity, "chairman to `ceo` only", "GitHub is the record", never
credentials from chat) there. The scripts here are one-line forwards (`agent-org messaging:watch` and so on), so what a
command does is whatever agent-org's current source says.

## It is off until the key exists, and the key waits for the token

Messaging is switched on by a `messaging` key in `.agent-org/project.json`: the provider, the path of the bot-token file, the path
of the chairman file, and the summary time. **This checkout's `project.json` has no such key**, so today every command below
does nothing useful, and each says so in its own way:

- `messaging:pair` and `messaging:listen` print `messaging: OFF (no messaging key ...)` and stop (`listen` exits 0, because
  nothing was expected of it).
- `messaging:watch` is silent and exits 0: it is run by a timer, and a timer unit that printed on every tick for a feature
  nobody enabled would be noise.
- `chairman:reply` **refuses** (`messaging is OFF ... nothing was sent`, exit 2), because its caller believes it is speaking to
  the chairman and exit 0 would be a lie.

**The key is added only after the bot-token file exists.** The token is a secret held outside the repository, by reference, in a
file under `~/.config/agent-org/` that must be mode 0600 and owned by the running user. agent-org's `messaging:check` reads the
configuration and those files' permissions, makes no network call, and **exits 1 when the token file is missing or unsafe**;
adding the key first would turn the feature on in a state where it cannot send. The chairman file is the exception: it is
written by `messaging:pair`, so `messaging:check` reports it as *not yet paired* rather than failing.

## The four commands

**`agent-org messaging:pair`: run once, in the chairman's own shell.** The chairman's Telegram user and chat ids are personal data
and this repository is public, so nobody types them anywhere. The command prints a one-time code, the chairman sends
`/pair <code>` to the bot from their phone within ten minutes, and the bot records the first sender that proves it in the
chairman file. A wrong, expired or reused code writes nothing and the bot says nothing back to a stranger. It is a human act and
not one an agent session runs.

**`agent-org messaging:watch`: the hourly unit.** One run reads GitHub, asks each source what the chairman should be told
(rows labelled `needs:chairman`, a stalled queue, an incident, the daily summary), and sends it once per event. It makes read
calls only, which the code enforces rather than promises, and it runs under the unit's own GitHub account, never a person's.
It is a one-shot program that a systemd timer runs, so running it by hand is for a test of the wiring, and a second copy does
not duplicate a message because the delivery log remembers what was sent.

**`agent-org messaging:listen`: the long-running half.** Where `watch` tells the chairman on a clock, `listen` hears them. It
long-polls Telegram (no inbound port is opened), accepts a message only from the paired chairman in a private chat, and hands it
on: a button press or reply to a request is written to that row as a comment and the label that asked is removed, which is how
`ceo` is woken with the answer as data; anything else is queued for `ceo` and nobody else. There must be exactly one listener,
enforced by a lock file on the host and by Telegram's `409 Conflict`; a second one is refused rather than retried.

**`agent-org chairman:reply "text with {{placeholders}}"`: the only way an agent speaks to the chairman.** It is `ceo`'s
command (`.agent-org/roles/ceo.md` is the brief that names it). The text may state a row, PR, run or count only through a
placeholder such as `{{issue:2885.labels}}`, which is re-read at send time and stamped "as of HH:MMZ"; a bare `#123`, a state
word or a number outside a placeholder is refused, so an unchecked claim cannot ride in free text. A read that fails refuses the
send and says which.

## What this page does not claim

It describes what the four commands are for, read from agent-org's source on 2026-10-03, not that messaging is running here: this
project's `project.json` carries no `messaging` key, and whether the units are installed on the host is a host fact this page
cannot show. The agent-org design document's own "what exists so far" table lags its source, so check the source before quoting
which stage is built.
