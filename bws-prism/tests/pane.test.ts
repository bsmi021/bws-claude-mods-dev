import { expect, test } from 'claude-code/testing'

const START = { cwd: '/repo', source: 'startup' } as never
const PANE = {
  plugin: 'bws-prism',
  component: 'Pane',
  requestId: 'prism',
  props: { title: 'Prism', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 24 }, view: {} },
} as const

// What lies beneath the plugin. API stubs answer { value }; session.start hands its event back.
const world = (on: any, surfaces: string[] = ['terminal']) => {
  const seen = { opened: 0 }
  on('session.start', async (_: unknown, e: unknown) => e)
  on('command.register', async () => ({ value: undefined }))
  on('clock.every', async () => ({ value: { cancel() {} } }))
  on('session.surfaces', async () => ({ value: surfaces }))
  on('ui.open', async () => { seen.opened++; return { value: { isPlaced: true } } })
  return seen
}

const run = ($: any, args: string) => $.command.run({ command: 'prism', args } as never)

test('the terminal draws a Raster sized to the pane, with the controls', async ($, on) => {
  world(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const art = await ui.find({ key: 'art' })
  expect(art?.type).toBe('Raster')
  expect(art?.props.columns).toBe(60)
  expect(art?.props.rows).toBe(20)
  expect(await ui.find({ key: 'scene' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /plasma/ })).toBeDefined()
  await ui.unmount()
})

test('Desktop draws an interactive Svg and no Raster', async ($, on) => {
  world(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Svg' }))?.props.isInteractive).toBe(true)
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  await ui.unmount()
})

test('the Scene and Palette buttons change the look; Pause flips its label', async ($, on) => {
  world(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'scene' })
  expect(await ui.find({ type: 'Text', text: /horizon/ })).toBeDefined()
  await ui.press({ key: 'palette' })
  expect(await ui.find({ type: 'Text', text: /ember/ })).toBeDefined()
  await ui.press({ key: 'pause' })
  expect((await ui.find({ key: 'pause' }))?.text).toContain('Play')
  await ui.unmount()
})

test('with no screen /prism says so and opens nothing', async ($, on) => {
  const seen = world(on, [])
  await $.session.start(START)
  const r: any = await run($, '')
  expect(r.text).toMatch(/no screen/)
  expect(seen.opened).toBe(0)
})

test('an unknown scene and an unknown verb answer in text', async ($, on) => {
  world(on)
  await $.session.start(START)
  expect(((await run($, 'scene nope')) as any).text).toMatch(/No scene "nope"/)
  expect(((await run($, 'dance')) as any).text).toMatch(/Usage/)
})
