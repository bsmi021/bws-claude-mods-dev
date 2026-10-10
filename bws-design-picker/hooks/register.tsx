import type { Register } from 'claude-code'

import { SECTION, galleries, galleryCells, gallerySvg, stripSpecs } from './lib'

export const register: Register = on => {
  // Tell Claude how to ask, only where it can ask.
  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    if (!e.tools.includes('AskUserQuestion')) return r
    return { sections: [...r.sections, { id: 'bws-design-picker:ask', text: SECTION, scope: 'session' }] }
  })

  // Draw the mockups above the engine's own picker, which still takes the answer.
  on('ui.render', { component: 'AskUserQuestion' }, async ($, e, next) => {
    const found = galleries(e.props.questions)
    if (found.length === 0) return next(e)
    const native = await next({ ...e, props: { ...e.props, questions: stripSpecs(e.props.questions) } })

    // One gallery fits the room the engine allows around its dialog: the first design question's.
    const g = found[0]!
    const header = `${g.header}: design directions, pick by number below`
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
