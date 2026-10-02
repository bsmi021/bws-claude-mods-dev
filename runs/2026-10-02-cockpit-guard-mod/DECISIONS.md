# DECISIONS

- **2026-10-02: Fix mode instead of warn-only.**
  - Brian first said "warn-only, no auto-rewrite". He then answered the report's Q3 with "Fix", and the latest message wins.
  - In fix mode the guard blocks calls that are certain to fail or cause harm, and adds the missing launch flags.
  - It never approves a tool call, and it never touches permission decisions.
- **2026-10-02: The low-VRAM UE flags come from Brian's own earlier sessions** (bws.game.tms, after "open it with reduced vram/performance"):
  - The flags: `-ExecCmds="t.MaxFPS 30, r.ScreenPercentage 50, r.Streaming.PoolSize 768, sg.ViewDistanceQuality 0, sg.TextureQuality 1, sg.ShadowQuality 0, sg.ShadingQuality 0, sg.ReflectionQuality 0, sg.PostProcessQuality 0, sg.GlobalIlluminationQuality 0, sg.FoliageQuality 0, sg.EffectsQuality 0"`.
  - Configurable through userConfig.
- **2026-10-02: Unity `-automated` is a documented rule.** Brian stated it 5 times, and the Unity pipeline logs "Start the editor with -automated".
- **2026-10-02: One plugin, `bws-cockpit`, holds both mods**, because they share the band and the probe cache.
- **2026-10-02: AGENTS.md loader re-enabled.** `cc-plugin-agents-md@builtin` was set back to true in `~/.claude/settings.json` (backup at `settings.json.bak-2026-10-02-agentsmd`). It takes effect for new sessions.
