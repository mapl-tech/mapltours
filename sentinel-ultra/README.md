# Sentinel Ultra

An installable skill that puts any AI agent on frontier-grade **judgment,
planning, verification, and reasoning** discipline — the working habits of the
strongest agentic models, encoded as an operating doctrine. Say **"Sentinel
Ultra"** and the agent switches modes.

What it changes: when the agent acts vs asks, how it plans (acceptance
criteria before code), what it's allowed to claim ("done" requires evidence
from the session), how it debugs (hypothesis → minimal discriminating test),
and how it reports (outcome first, faithful about failures).

What it doesn't do: add model capability, override safety/permission systems,
or turn a weak model into a strong one. Habits raise the floor; the ceiling
is still the model.

## Install — Claude Code

**Everywhere on your machine (recommended):**

```bash
mkdir -p ~/.claude/skills/sentinel-ultra
cp skills/sentinel-ultra/SKILL.md ~/.claude/skills/sentinel-ultra/SKILL.md
```

**Single project (shared with the team via git):**

```bash
mkdir -p .claude/skills/sentinel-ultra
cp skills/sentinel-ultra/SKILL.md .claude/skills/sentinel-ultra/SKILL.md
```

Start a new Claude Code session, then either say a trigger phrase or invoke
directly with `/sentinel-ultra`.

## Install — any other agent (Cursor, Windsurf, custom agents, API)

The skill body is plain markdown with no Claude-specific machinery. Take
everything in `SKILL.md` **below the frontmatter** (the `---` block at the
top) and put it wherever your agent accepts standing instructions:

- **Cursor**: `.cursor/rules/sentinel-ultra.mdc` (set it to apply always or
  on request)
- **Windsurf**: `.windsurf/rules/`
- **Custom agent / API**: append to the system prompt, or gate it behind a
  check for the trigger phrases in the user message
- **Claude Agent SDK**: register it as a skill the same way as Claude Code

## Triggers

| Say | Get |
|---|---|
| `Sentinel Ultra` / `ultra mode` / `go ultra` / `SU:` | Full doctrine for the rest of the session |
| `ultra verify` | Maximum verification rigor on the current task only |
| `ultra plan` | Plan + acceptance criteria first, execution waits for go-ahead |
| `ultra off` | Back to default behavior |

The agent also self-activates (and says so) before high-stakes work: deploys,
migrations, security-sensitive changes, long multi-step builds, debugging.

## Relationship to Sentinel

Independent but complementary: Sentinel (the MCP server) supplies **design
intelligence** — patterns, memories, briefs, scoring. Sentinel Ultra supplies
**execution discipline** — how the agent works on anything. Run both: Ultra
governs the process, Sentinel informs the design decisions.

**The doctrine is also served through the MCP connection itself** — no local
install needed for connected agents: the server's handshake instructions
teach the workflow, every client-brain brief embeds the discipline core, and
the `sentinel_ultra` tool returns the full doctrine (or `plan`/`verify`
slices) on demand. This local skill copy is for agents that aren't connected
to Sentinel, or for making the discipline apply before a connection exists.
