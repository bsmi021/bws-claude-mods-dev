# Mod ideas from Ray Amjad's "How the Top 1% Use Claude Code Mods" (Od9706XIXcc, 19:05, 2026-10-12)

Transcript pulled via Chrome transcript panel (yt-dlp blocked: 429/bot check, cookie DB locked). Not saved to disk; chapters:
Check Every Turn, Building Blocks, Memory Mod, Diagram Pane, DreamPath, Message Board, Swarm Pane, Decision Tree, Cache Clock, Jev Skills, Secret Box, Prompt Bouncer.

Core pattern: on turn.complete a cheap classifier (haiku) decides "anything worth doing?"; if yes, `$.model.fork` (same prompt cache) does the work in a side pane while the main turn continues.

## Verified in local 2.1.296 types
- `$.model.fork` (cache-sharing, tool-less), `$.model.complete`, `$.model.classify` (label only, NO probabilities / logprobs).
- `prompt.attachment` type `skill_listing` is rewritable -> skill gating possible.
- `prompt.section` can null named system-prompt sections.

## Candidates vs. what exists
| Idea | Exists here? | Verdict |
|---|---|---|
| Cache clock + auto-handoff < 5 min left | handoff.ts in cockpit, no timer | Build: small, high value |
| Prompt bouncer (haiku gate on prompt.submit, project glossary) | bws-enhance rewrites; no gate | Add mode to bws-enhance |
| Skill gating (Jev-style) | none | Build: ~50 skills listed every session. Use complete() with ranked list, not logprobs |
| Memory mod (classify -> fork -> write memory) | none | Build; overlaps built-in memory/dream, so scope to project memory files |
| Diagram pane (big task -> fork -> diagram; pin inline mermaid) | none | Build; terminal render needs Raster/Svg (design-picker has Raster code) |
| DreamPath (consolidate memory every N turns / pre-compact) | none | Follow-up to memory mod |
| Decision tree (/explain, fork per option, tree map) | sidechat is linear | Extend sidechat later |
| Message board | bws-board (richer: claims, git lease) | Skip; maybe swarm-stats tab |
| Swarm pane | sandbox-provider specific | Skip |
| Secret box (request_secret tool, redacted env) | none | Later; redaction part is hard |
