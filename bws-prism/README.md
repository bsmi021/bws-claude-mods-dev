# bws-prism

A showpiece for what a Claude Code mod can draw. `/prism` opens a pane of animated generative art.

- **Terminal:** a `Raster` of half-block pixels, repainted 20 times a second with `$.ui.blit`, with a pixel logo and spectrum bars over the scene.
- **Desktop:** an `Svg` that animates itself with SMIL, so no frames are sent.

Four scenes (plasma, horizon, tunnel, lava) and four palettes (neon, ember, aurora, vapor).

## Commands

| Command | Does |
|---|---|
| `/prism` | Opens the pane |
| `/prism scene [name]` | Next scene, or the named one |
| `/prism palette [name]` | Next palette, or the named one |
| `/prism pause` | Pauses or resumes the terminal animation |
| `/prism close` | Closes the pane |

With the pane focused: `s` scene, `p` palette, `k` pause, `x` close.

## Try it

```bash
claude --plugin-dir ./bws-prism
```

## Capabilities

Draws only. No files, network, processes, model calls, permissions or configuration.

The look resets on reload.
