# codetgk

A clean-room, terminal-first coding agent with provider-neutral orchestration.

The first foundation supports:

- Ollama and OpenAI-compatible chat endpoints
- Read, write, search, shell, and Git tools
- Explicit approval before writes and shell commands
- Planner, implementer, tester, and reviewer workflow roles
- JSON provider configuration in `config.json` (no account or email login)
- JSONL session persistence in `.codetgk/sessions`

## Quick start

```bash
npm install
npm run build
npm link
codetgk init
codetgk
```

Run `codetgk init` to create a local `config.json`. By default, Codetgk uses
OpenCode's signed-in provider and its `big-pickle` free model. Set
`activeProvider` to `ollama`, `nvidia`, or `openrouter` to use another provider.
API keys for external OpenAI-compatible providers are read from the environment
named by `apiKeyEnv`. For example:

```bash
export OPENCODE_API_KEY="your-key"
codetgk workflow --provider opencode "Fix the failing tests"

export NVIDIA_API_KEY="your-key"
codetgk workflow --provider nvidia --model "your-nvidia-model" "Implement the feature"
```

Any provider exposing an OpenAI-compatible `/chat/completions` endpoint can be
added to `config.json`. Environment variables are recommended so keys are not
written to disk; `config.json` is ignored by Git.

## Deep workflow mode

For tasks that need a deliberate implementation pass, run:

```bash
codetgk workflow "Add feature X and verify it with tests"
```

This mode runs five focused stages: planning, repository exploration,
implementation, testing, and review. Each stage receives repository-aware
search and Git status tools, requests approval before writes or shell commands,
and carries the previous stage's findings forward. The workflow now uses an
inspect → edit → verify protocol and can take up to 20 model/tool turns per
stage, while keeping the final report concise rather than exposing hidden
chain-of-thought.

The full-screen `codetgk` command delegates to the OpenCode TUI and its native
agent loop. Output quality still depends on the selected model and provider;
these safeguards improve tool use and verification but cannot make a smaller
model equivalent to a frontier model.

Add `--research` as a command option or at the end of the task to request
multi-source web research:

```bash
codetgk workflow "Compare current TypeScript runtimes --research"
```

Research gathers several public HTTPS pages, gives the model their extracted
text and URLs, and asks it to compare evidence rather than repeat one source.
Responses are concise by default; ask for more detail explicitly when needed.

Useful next improvements are project-local instructions (a checked-in
`AGENTS.md`), structured patch editing instead of whole-file rewrites, a
persistent task checklist, and evaluation fixtures that score tool choice,
test coverage, factual citations, and concise output.

This project is independently implemented and does not include Anthropic source code,
prompts, branding, or internal implementation.

## Full-screen terminal mode

Running `codetgk` with no arguments launches the OpenCode terminal UI in standalone
mode. It fills the terminal, displays animated chat and tool output, and supports
slash commands such as `/help`, `/models`, and `/sessions`. The default OpenCode
provider reuses your existing OpenCode login.

The OpenCode source used as the open-source TUI foundation is cloned at
`/home/tgk/Projects/opencode`. Set `CODETGK_OPENCODE_BIN` if you want to run a
different OpenCode build.

## Full-screen backdrop

The home screen is no longer a logo floating in empty space. An ambient layer
fills the terminal behind everything else:

- a **dot lattice** on a staggered offset, so it never reads as graph paper
- **drifting doodles** (`✦ ✧ ˚ ∗ ° ✺ ⋆`) that twinkle on their own phase and bob gently
- a slow **ribbon** of brighter dots that crosses the screen every nine seconds

The lattice is cached into an offscreen buffer and blitted per frame, so the
cost of a redraw tracks the sprite count rather than the terminal size. The
layer is non-focusable and deliberately excluded from the hit grid so it never
steals clicks from the prompt. With animations disabled it degrades to a static
lattice.

It lives in `packages/tui/src/component/backdrop.tsx` (renderable) and
`backdrop-view.tsx` (the full-screen wrapper mounted from `routes/home.tsx`).

## Startup animation

On launch the `codetgk` wordmark plays a one-shot intro before settling into the
static logo:

1. **Arrival** - a wipe front travels left to right; the glyphs resolve out of the
   backdrop behind it.
2. **Shimmer** - a soft accent highlight rides across the solid wordmark and eases
   back out.

The sequence runs once per launch (returning to the home screen will not replay
it), is driven by the terminal's own frame clock, and is skipped entirely when
`animations` is off in the OpenCode config. The accent comes from the active
theme, so it reads teal under `codetgk-abyss` and green under `codetgk-moss`.

It lives in `packages/tui/src/component/boot-logo.tsx` (`BootLogoRenderable`) and
`component/logo.tsx`, which flattens the source art into a glyph grid.

Set `theme` in `config.json` (or `codetgk init`) to change the palette. Two
themes ship with codetgk and live in `~/.config/opencode/themes/`:

- `codetgk-abyss` — dark teal/cyan on near-black
- `codetgk-moss` — forest/olive on charcoal

Override per run with `-t/--theme <name>` and `--theme-mode system|dark|light`,
or via the `CODETGK_THEME` environment variable.

Themes are loaded from `<opencode config dir>/themes/*.json`, where the config
dir is `OPENCODE_CONFIG_DIR` or `~/.config/opencode`. Because the theme belongs
to the CLI/TUI config rather than the core config, codetgk passes it through
`OPENCODE_CLI_CONFIG_CONTENT`; writing it into `OPENCODE_CONFIG_CONTENT` is
silently ignored.

## Rebuilding the TUI

The TUI is a patched fork of the OpenCode sources. After changing anything under
`packages/tui`, rebuild and point codetgk at the result:

```bash
cd /home/tgk/Projects/opencode
bun run --cwd packages/cli build --skip-web-ui --single
```

codetgk automatically prefers that build over a stock `opencode` install. Drop
the `--single` flag to cross-compile for every platform.
