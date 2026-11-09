# bws-prism

A showpiece for what a Claude Code mod can draw. `/prism` opens a pane of animated generative art.

Built for the Desktop app.

- **Desktop:** an `Svg` that animates itself with SMIL. `Image` swaps it for a real PNG inside the Svg. `Backdrop` draws the scene full window behind frosted panels.
- **Terminal:** a `Raster` of half-block pixels at 20 frames a second, or true pixels with `Image` where kitty, Ghostty or iTerm2 can show them.

Four scenes (plasma, horizon, tunnel, lava) and four palettes (neon, ember, aurora, vapor).

## Commands

| Command | Does |
|---|---|
| `/prism` | Opens the pane |
| `/prism scene [name]` | Next scene, or the named one |
| `/prism palette [name]` | Next palette, or the named one |
| `/prism image`, `/prism vector` | Picture or vector art (in the terminal, `Image` or `Raster`) |
| `/prism backdrop` | Full-window scene behind the app, on or off (Desktop) |
| `/prism pause` | Pauses or resumes the animation (terminal) |
| `/prism close` | Closes the pane |

With the pane focused: `s` scene, `p` palette, `m` picture or vector, `b` backdrop, `k` pause, `x` close.

## Try it

```bash
claude --plugin-dir ./bws-prism
```

## Capabilities

Draws only. No files, network, processes, model calls, permissions or configuration.

The look resets on reload.
