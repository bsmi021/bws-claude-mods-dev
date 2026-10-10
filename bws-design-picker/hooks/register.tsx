import type { Register } from 'claude-code'

import { GEN_SYSTEM, SECTION, galleries, galleryCells, galleryFromReply, gallerySvg, genPrompt, stripSpecs, wantsGenerated } from './lib'

const GALLERIES = { plugin: 'bws-design-picker', key: 'galleries' } as const
const PENDING = { plugin: 'bws-design-picker', key: 'pending' } as const

export const register: Register = (on, options) => {
  // Tell Claude how to ask, only where it can ask.
  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    if (!e.tools.includes('AskUserQuestion')) return r
    return { sections: [...r.sections, { id: 'bws-design-picker:ask', text: SECTION, scope: 'session' }] }
  })

  // Lift the specs out of the previews before the dialog opens: a render rewrite may not change
  // previews, so this is the one place the native dialog can be spared the JSON.
  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    const first = galleries(e.questions)[0]
    if (first) {
      await $.state.set({ ...GALLERIES, id: e.tool_use_id }, first)
      return next({ ...e, questions: stripSpecs(e.questions) })
    }

    // A design question Claude gave no specs for: open the dialog at once and have a small model draw
    // the specs meanwhile. An answer before it is done cancels the call.
    const wanted = options.autoGenerate === false ? undefined : wantsGenerated(e.questions)
    if (!wanted) return next(e)
    const id = e.tool_use_id
    const stop = new AbortController()
    await $.state.set({ ...PENDING, id }, true)
    const drawing = $.model
      .complete(
        { model: String(options.model || 'haiku'), system: GEN_SYSTEM, prompt: genPrompt(wanted.question), maxTokens: 6000, timeoutMs: 90_000 },
        { signal: stop.signal },
      )
      .then(async r => {
        const g = r.isAnswered ? galleryFromReply(r.text, wanted.question) : undefined
        if (g) await $.state.set({ ...GALLERIES, id }, g)
      })
      .catch(() => undefined)
      .finally(() => $.state.set({ ...PENDING, id }, false))
    try {
      return await next(e)
    } finally {
      stop.abort()
      await drawing
    }
  })

  // Draw the mockups above the engine's own picker, which still takes the answer. One gallery fits the
  // room the engine allows around its dialog: the first design question's.
  on('ui.render', { component: 'AskUserQuestion' }, async ($, e, next) => {
    const { value } = await $.state.get({ ...GALLERIES, id: e.requestId })
    const g = value ?? galleries(e.props.questions)[0]
    if (!g) {
      const { value: isDrawing } = await $.state.get({ ...PENDING, id: e.requestId })
      if (!isDrawing) return next(e)
      const native = await next(e)
      const { Box, Text } = $.ui.resolve(e)
      return (
        <Box flexDirection="column">
          <Text dimColor>drawing mockups of these directions…</Text>
          {native}
        </Box>
      )
    }
    const native = await next(e)
    const header = `${g.header} · pick by number below`

    if (e.surface === 'terminal') {
      const { Box, Text, Raster } = $.ui.resolve(e)
      const art = galleryCells(g.cards, e.viewport?.columns ?? 100)
      if (!art) return native
      return (
        <Box flexDirection="column">
          <Text dimColor>{header}</Text>
          <Raster key="gallery" columns={art.columns} rows={art.rows} cells={art.cells} />
          {native}
        </Box>
      )
    }

    const table = $.ui.resolve(e)
    if (!('Svg' in table)) return native
    const { Box, Text, Svg } = table
    const art = gallerySvg(g.cards)
    return (
      <Box flexDirection="column">
        <Text dimColor>{header}</Text>
        <Svg source={art.source} alt={g.cards.map(c => `${c.number}. ${c.label}`).join(', ')} width={art.width} />
        {native}
      </Box>
    )
  })
}
