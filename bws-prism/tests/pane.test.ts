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

test('/prism image draws an Image with alt text; /prism raster goes back', async ($, on) => {
  world(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await run($, 'image')
  const photo = await ui.find({ key: 'photo' })
  expect(photo?.type).toBe('Image')
  expect(photo?.props.alt).toMatch(/plasma/)
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  await run($, 'raster')
  expect((await ui.find({ key: 'art' }))?.type).toBe('Raster')
  await ui.unmount()
})

test('on Desktop Image embeds a PNG, Vector goes back, and there is no Pause', async ($, on) => {
  world(on, ['desktop'])
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ key: 'pause' })).toBeUndefined()
  await ui.press({ key: 'mode' })
  expect((await ui.find({ type: 'Svg' }))?.props.source).toContain('data:image/png')
  await ui.press({ key: 'mode' })
  expect((await ui.find({ type: 'Svg' }))?.props.source).not.toContain('data:image/png')
  await ui.unmount()
})

test('the backdrop is set, then cleared, and a refusal is said', async ($, on) => {
  world(on, ['desktop'])
  const calls: unknown[] = []
  let isDrawn = true
  on('ui.backdrop', async (_: unknown, e: any) => { calls.push(e.backdrop); return { value: isDrawn ? { isDrawn: true, requestId: 'b' } : { isDrawn: false, reason: 'no room' } } as never })
  await $.session.start(START)
  await run($, 'backdrop')
  expect((calls[0] as any).id).toBe('prism-backdrop')
  await run($, 'backdrop')
  expect(calls[1]).toBeUndefined()
  isDrawn = false
  expect(((await run($, 'backdrop')) as any).text).toMatch(/no room/)
})

test('Desktop draws an interactive Svg and no Raster', async ($, on) => {
  world(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Svg' }))?.props.isInteractive).toBe(true)
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  await ui.unmount()
})

test('the Scene and Palette buttons change the look', async ($, on) => {
  world(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'scene' })
  expect(await ui.find({ type: 'Text', text: /horizon/ })).toBeDefined()
  await ui.press({ key: 'palette' })
  expect(await ui.find({ type: 'Text', text: /ember/ })).toBeDefined()
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
