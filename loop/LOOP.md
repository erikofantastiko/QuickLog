# QuickLog — Loop Engineering Playbook

Wiederkehrender, robuster Loop mit **unabhängigem Verifier** (nie Self-Review).
Schema: **Discover → Plan → Execute → Verify → Iterate**.

## Rollen

- **Builder Agent** (`.claude/agents/quicklog-builder.md`) — implementiert genau *ein* Backlog-Item
  in einem isolierten Branch/Worktree. Darf editieren.
- **Verifier Agent** (`.claude/agents/quicklog-verifier.md`) — read-only. Nimmt an, der Output ist
  falsch, bis Gates bewiesen sind. Darf NICHT editieren (erzwingt Unabhängigkeit). Kann „REJECT".

## Queue (Discover-Quelle)

[../Scratchpad.md](../Scratchpad.md) — Backlog P0–P3. Ein Item pro Loop-Iteration, höchste Prio zuerst.

## Verifier-Orakel (objektive Gates aus [../CLAUDE.md](../CLAUDE.md))

1. **Sheet-Parität** — `copyForSheet`/`SHEET_COLUMNS` byte-identisch, Spalten Live 23 / Backtest 28.
2. **Sizing-Mathematik** — `vol = riskAmt/(dist×cv)`, JPY `cv = 100000/entry` — unverändert, außer das
   Item ändert sie bewusst.
3. **Syntax** — `node --check` auf das aus `index.html` extrahierte Script.
4. **Scope** — Diff ändert nur, was das Item verlangt (Persistenz/Chart/Sizing sonst unangetastet).
5. **Item-spezifische Akzeptanzkriterien** (im Plan der Iteration definiert).

## Loop ausführen (manuell, in Claude Code)

```
# Discover + Plan: Item aus Scratchpad.md wählen, Akzeptanzkriterien notieren.
# Execute:
Agent(subagent_type="quicklog-builder", isolation="worktree",
      prompt="Implementiere Backlog-Item <ID>. Branch loop/<id>. Gates: <…>. Gib vollen Diff zurück.")
# Verify (separat, unabhängig):
Agent(subagent_type="quicklog-verifier",
      prompt="Branch loop/<id>. Assume wrong. Prüfe Gates G1..Gn. Verdict APPROVE/REJECT + Fixes.")
# Iterate: REJECT → Fixes an Builder. APPROVE → Merge-Vorschlag an User.
```

## Persistenz

Jede Iteration hinterlässt Artefakte: der Branch `loop/<id>`, der Verifier-Verdict (als
`loop/verdicts/<id>.md`), und ein Changelog-Eintrag in [../Scratchpad.md](../Scratchpad.md).
Merge auf `main` nur nach APPROVE + User-Freigabe.
