# Mr Coder

```
 ██████   ██████  █████████              █████████     █████████   █████████     ██████████   █████████
░░██████ ██████   ░███░░░███░           ███░░░░░███   ███░░░░░███  ░███░░████   ░░███░░░░░█░  ░███░░░███░
 ░███░█████░███   ░███   ░███          ███     ░░░   ███     ░███  ░███  ░░███   ░███  █ ░    ░███   ░███
 ░███░░███ ░███   ░█████████░         ░███          ░███     ░███  ░███   ░███   ░██████      ░█████████░
 ░███ ░░░  ░███   ░███░░███           ░███          ░███     ░███  ░███   ░███   ░███░░█      ░███░░███
 ░███      ░███   ░███  ░░███         ░░███  ░░███  ░░███    ░███  ░███  ░░███   ░███ ░       ░███  ░░███
 █████     █████  █████   █████         ░░█████████   ░░█████████   █████████     ██████████   █████   █████
░░░░░     ░░░░░   ░░░░░    ░░░          ░░░░░░░░░     ░░░░░░░░░    ░░░░░░░░░    ░░░░░░░░░░    ░░░░░    ░░░
```

Mr Coder is an open-source AI coding agent that lives in your terminal. Ask it
questions about your codebase, generate and edit code, run commands, debug
issues, and automate routine development work — all without leaving the shell.

It ships with a dark, orange-accented look ported from
[MiMo Code](https://github.com/XiaomiMiMo/MiMo-Code): near-black panels,
`#FF6A00` primary orange, and flat theme colors that render exactly as
specified.

## What Mr Coder does

- **Understands and edits large codebases** — query, navigate, and refactor with
  full project context.
- **Generates and fixes code** — new features, bug fixes, tests, and docs from
  natural-language prompts.
- **Runs your workflow** — shell commands, checkpointing, session resume, and
  non-interactive modes for scripts (`-p`, `--output-format json`,
  `--output-format stream-json`).
- **Extends with MCP servers and extensions** — connect custom tools and add
  your own slash commands.
- **Remembers your project** — persistent instructions live in `MR-CODER.md`
  context files (see below).

## Installation (from source)

Requires Node.js 20 or newer.

```bash
git clone https://github.com/mattritchey/mrcoder.git
cd mrcoder
npm install
npm run build
cd packages/cli && npm link
```

Then run it from any project directory:

```bash
mr-coder
```

(The `gemini` command name is kept as an alias bin entry, so existing scripts
that call `gemini` keep working.)

## Authentication

Mr Coder uses the same upstream auth methods and environment variables:

```bash
# API key
export GEMINI_API_KEY="YOUR_API_KEY"
mr-coder

# Or sign in with Google on first run
mr-coder
```

Any compatible endpoint can be used by pointing the client at it:

```bash
export GOOGLE_GEMINI_BASE_URL="http://127.0.0.1:4054"
```

## Quick start

```bash
# Interactive session in the current directory
mr-coder

# Pick a model
mr-coder -m mimo-v2.6-flash-free

# One-shot prompt (great for scripts)
mr-coder -p "Explain the architecture of this codebase"

# Structured output
mr-coder -p "Run the tests and summarize failures" --output-format json
```

Useful slash commands inside a session: `/help`, `/theme`, `/init`,
`/memory list`, `/memory reload`, `/auth`, `/mcp list`.

## Commands Mr Coder adds

Five commands ported from other coding agents, on top of everything upstream:

- **`/doctor`** (from Claude Code) — health-checks the install: Node runtime,
  auth, model, endpoint reachability, context files, folder trust, MCP servers,
  extensions, git, and checkpointing, with a suggested fix for every warning or
  failure.
- **`/review [base]`** (from Codex) — a strictly read-only review of your
  uncommitted changes (or the diff against a base ref). Findings only; no file
  is ever modified.
- **`/transcript [path]`** (from hax) — exports the model-facing transcript of
  the session: the context files loaded, the tool schemas the model was offered,
  and the full conversation with tool calls and results.
- **`/recipe`** (from Goose) — reusable, parameterized task templates stored as
  TOML files in `.mr-coder/recipes/` or `~/.gemini/recipes/`. `/recipe` lists
  them, `/recipe run <name> key=value` renders and runs one.
- **`/goal <objective>`** (from Kimi Code) — goal mode: a persistent objective
  the agent keeps working toward across turns. An `AfterAgent` hook returns it
  to the goal whenever it stops early, until it reports `GOAL COMPLETE` or the
  turn cap is hit. `/goal status | pause | resume | cancel | next` manages it.

## Context files: MR-CODER.md

Put persistent, project-specific instructions in a `MR-CODER.md` file and Mr
Coder loads it automatically (from the current directory up to the repo root,
plus a global one in your home config directory). Run `/init` in a session to
have Mr Coder analyze the project and draft one for you.

**Existing `GEMINI.md` files are still discovered** alongside `MR-CODER.md`, so
projects you already set up keep working untouched.

## The look

The default **Mr Coder** theme is a direct port of MiMo Code's palette:

| Role             | Value     |
| ---------------- | --------- |
| Background       | `#0a0a0a` |
| Panel background | `#141414` |
| Element / focus  | `#1e1e1e` |
| Primary          | `#FF6A00` |
| Secondary        | `#FF8A3C` |
| Accent           | `#818CF8` |
| Text             | `#eeeeee` |
| Text muted       | `#808080` |
| Border           | `#484848` |

All upstream themes remain available via `/theme`.

## Zen bridge wiring (local eval setup)

In the author's local setup, Mr Coder runs against a local bridge on its own
port, **:4054** (separate from Gemini CLI's :4036), via a small wrapper:

```sh
#!/bin/sh
set -e
export GOOGLE_GEMINI_BASE_URL="http://127.0.0.1:4054"
export GEMINI_API_KEY="anything"
export GEMINI_CLI_TRUST_WORKSPACE="true"
exec mr-coder -m mimo-v2.6-flash-free "$@"
```

Note the base URL carries **no** `/v1` suffix — the client appends the API path
itself.

## How Mr Coder differs from upstream

See [MR-CODER.md](./MR-CODER.md) for the complete, exact list. In short: the
name and binary, the branding and word-art, the MiMo-derived default theme, flat
(unblended) theme colors, `MR-CODER.md` as the primary context filename, and
five added slash commands (`/doctor`, `/review`, `/transcript`, `/recipe`,
`/goal` — see above). Everything else — features, tools, settings, MCP,
extensions, and auth — works as upstream. Functional identifiers (`GEMINI_*` env
vars, the `~/.gemini` config directory, workspace package names) intentionally
keep their upstream names: they are APIs, not branding.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and how to submit
pull requests.

## License

Apache License 2.0 — see [LICENSE](LICENSE).

---

Mr Coder is a fork of
[google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli)
(upstream commit `ed96fae`, v0.66.0-nightly). Thanks to the upstream authors and
contributors.
