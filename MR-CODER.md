# Mr Coder

A fork of
[google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli)
(upstream commit `ed96fae`, v0.66.0-nightly.20261013), published at
[github.com/mattritchey/mrcoder](https://github.com/mattritchey/mrcoder).

## What changed vs upstream — and only this

1. **Name / binary:** the CLI package is now `mr-coder`. The binary is
   `mr-coder` (`gemini` is kept as an alias bin entry so existing scripts keep
   working).
2. **Background / theme:** a new built-in theme, **Mr Coder**, is the default
   theme. Its palette is a direct port of MiMo Code's default theme
   (`mimocode.json` in
   [XiaomiMiMo/MiMo-Code](https://github.com/XiaomiMiMo/MiMo-Code)):

   | Role                                | MiMo token                   | Value                         |
   | ----------------------------------- | ---------------------------- | ----------------------------- |
   | Background                          | darkStep1                    | `#0a0a0a`                     |
   | Background panel (input / messages) | darkStep2                    | `#141414`                     |
   | Background element / focus          | darkStep3                    | `#1e1e1e`                     |
   | Primary                             | darkStep9                    | `#FF6A00`                     |
   | Secondary                           | darkSecondary                | `#FF8A3C`                     |
   | Accent (keywords / headings)        | darkAccent                   | `#818CF8`                     |
   | Error                               | darkRed                      | `#FB7185`                     |
   | Warning                             | darkOrange                   | `#FBBF24`                     |
   | Text                                | darkStep12                   | `#eeeeee`                     |
   | Text muted / comment                | darkStep11                   | `#808080`                     |
   | Border                              | darkStep7                    | `#484848`                     |
   | Diff added background               | diffAddedBg                  | `#20303b`                     |
   | Diff removed background             | diffRemovedBg                | `#37222c`                     |
   | Gradient (logo / headings)          | primary → secondary → accent | `#FF6A00 → #FF8A3C → #818CF8` |

   Theme file: `packages/cli/src/ui/themes/builtin/dark/mr-coder-dark.ts`,
   registered in `packages/cli/src/ui/themes/theme-manager.ts`
   (`DEFAULT_THEME = MrCoder`). All upstream themes are still available via
   `/theme`.

3. **Nothing else.** All features, tools, settings, auth, MCP, extensions, and
   the Gemini wire protocol are unchanged. Internal workspace packages
   (`@google/gemini-cli-core`, etc.) and `GEMINI_*` / `GOOGLE_GEMINI_*`
   environment variables keep their upstream names — they are APIs, not
   branding.

## Build & run (from a clone)

```
npm install
npm run build
# after npm link in packages/cli:
mr-coder
```

## Zen bridge wiring (eval harness)

Mr Coder joins the Zen harness shelf on its own port, **:4054** (slug
`mrcoder`), separate from Gemini CLI's :4036 — the bridge's `/v1beta`
Gemini-wire routes serve both, since mr-coder speaks the same protocol.

Wrapper `~/.local/bin/mr-coder-zen` (Mac):

```sh
#!/bin/sh
set -e
export GOOGLE_GEMINI_BASE_URL="http://127.0.0.1:4054"
export GEMINI_API_KEY="anything"
export GEMINI_CLI_TRUST_WORKSPACE="true"
exec mr-coder -m mimo-v2.6-flash-free "$@"
```

Note the base URL carries **no** `/v1` suffix — the CLI appends
`/v1beta/models/...` itself, exactly as with `gemini-zen` on :4036.

Isolation note: mr-coder shares `~/.gemini/settings.json` with the stock Gemini
CLI unless `GEMINI_CLI_HOME` points elsewhere. The mr-coder default theme is
built in, so no settings change is needed for the MiMo background.

## Upstream

Remotes: `origin` = mattritchey/mrcoder (this fork), `upstream` =
google-gemini/gemini-cli. Sync with
`git fetch upstream && git merge upstream/main`.
