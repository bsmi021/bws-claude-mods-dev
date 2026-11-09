// bws-prism: /prism opens a pane of animated art. The only file that uses `$`.
import type { EngineInterface, Register } from 'claude-code'
import { fit, gradient, hex, imageFrame, isImageRefused, PALETTES, ramp, rasterFrame, SCENES, LEVELS } from './art'
import type { Look, Scene } from './art'
import { sceneSvg } from './vector'

const PANE = 'prism'
const ART = 'art'
const PHOTO = 'photo'
const TICK_MS = 50 // 20 frames a second
const STEP = 0.05 // scene time per frame

// Module variables: a demo's look need not outlive a reload.
let sceneAt = 0
let paletteAt = 0
let isImage = false // true pixels with Image instead of Raster's cells (terminal only)
let note = '' // why Image was given up, shown under the art
let frameNo = 0
let isPaused = false
let time = 0
let mounted: { columns: number; rows: number } | null = null // the Raster now on screen; null while there is none
let timer: { cancel: () => void } | null = null
let isPainting = false

const look = (): Look => ({ scene: SCENES[sceneAt]!, palette: PALETTES[paletteAt]! })

function stop() {
  timer?.cancel()
  timer = null
  mounted = null
  isPainting = false
}

async function paint($: EngineInterface) {
  const size = mounted
  if (!size || isPaused || isPainting) return
  const asImage = isImage
  if (asImage && frameNo++ % 2) return // an Image frame costs more: 10 a second
  isPainting = true
  time += asImage ? STEP * 2 : STEP
  const r = asImage
    ? await $.ui.blit({ requestId: PANE, key: PHOTO, source: imageFrame(look(), time, size.columns, size.rows) })
    : await $.ui.blit({ requestId: PANE, key: ART, ...rasterFrame(look(), time, size.columns, size.rows) })
  isPainting = false
  if (!r.deny || mounted !== size || asImage !== isImage) return // a redraw has changed what is mounted, so this refusal is stale
  $.ui.log(`prism: blit refused: ${r.deny}`, { to: 'debug' })
  if (asImage && isImageRefused(r.deny)) {
    isImage = false
    note = 'No Image here: needs kitty, Ghostty or iTerm2.'
    $.ui.invalidate('ui.render')
    return
  }
  stop() // not mounted any more: the pane closed
}

function setImage($: EngineInterface, on: boolean) {
  isImage = on
  note = ''
  $.ui.invalidate('ui.render')
}

function act($: EngineInterface, what: 'scene' | 'palette' | 'pause', name?: string): string {
  if (what === 'pause') {
    isPaused = !isPaused
  } else if (what === 'scene') {
    const at = SCENES.indexOf(name as Scene)
    if (name && at < 0) return `No scene "${name}". Scenes: ${SCENES.join(', ')}.`
    sceneAt = name ? at : (sceneAt + 1) % SCENES.length
  } else {
    const at = PALETTES.findIndex(p => p.name === name)
    if (name && at < 0) return `No palette "${name}". Palettes: ${PALETTES.map(p => p.name).join(', ')}.`
    paletteAt = name ? at : (paletteAt + 1) % PALETTES.length
  }
  $.ui.invalidate('ui.render')
  return ''
}

const USAGE = 'Usage: /prism [scene [name] | palette [name] | image | raster | pause | close]'

export const register: Register = on => {
  sceneAt = 0
  paletteAt = 0
  isImage = false
  note = ''
  frameNo = 0
  isPaused = false
  time = 0
  stop()

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'prism',
      description: 'Open a pane of animated art: Raster in the terminal, Svg on Desktop',
      argumentHint: '[scene [name] | palette [name] | image | raster | pause | close]',
      immediate: true,
    })
    return next(e)
  })

  on('command.run', { command: 'prism' }, async ($, e) => {
    const [verb = '', name] = e.args.trim().toLowerCase().split(/\s+/)
    if (verb === 'close') {
      await $.ui.close({ id: PANE })
      stop()
      return {}
    }
    if (verb === 'image' || verb === 'raster') {
      if (!(await $.session.surfaces()).includes('terminal')) return { text: 'Raster and Image are terminal elements. Desktop draws Svg.' }
      setImage($, verb === 'image')
      return {}
    }
    if (verb === 'scene' || verb === 'palette' || verb === 'pause') {
      const problem = act($, verb, name)
      return problem ? { text: problem } : {}
    }
    if (verb !== '') return { text: USAGE }
    if ((await $.session.surfaces()).length === 0) return { text: 'bws-prism draws a pane, and this session has no screen. Run /prism in the terminal or the Desktop app.' }
    const r = await $.ui.open({ id: PANE, title: 'Prism' })
    return r.isPlaced ? {} : { text: `Prism is waiting for room (${r.reason}).` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const table = $.ui.resolve(e)
    const { Box, Text, Button } = table
    const now = look()
    const colors = ramp(now.palette.stops)
    const title = gradient('P R I S M', colors)
    const swatch = Array.from({ length: 16 }, (_, i) => hex(colors[Math.floor((i / 15) * (LEVELS - 1))]!))

    let art = <Text dimColor>This surface cannot draw the art.</Text>
    let mode = 'text'
    const isTerminal = e.surface === 'terminal' && 'Raster' in table
    if (e.surface === 'terminal' && 'Raster' in table) {
      const { Raster, Image } = table
      const size = fit(e.props.bodyColumns, e.props.scroll.bodyRows, e.props.placement)
      mounted = size
      if (!timer) timer = $.clock.every(TICK_MS, () => void paint($).catch(() => { isPainting = false }))
      if (isImage) {
        const source = imageFrame(now, time, size.columns, size.rows)
        art = <Image key={PHOTO} source={source} columns={size.columns} rows={size.rows} alt={`Animated ${now.scene} scene in the ${now.palette.name} palette`} />
        mode = `Image ${source.width}x${source.height} px`
      } else {
        const frame = rasterFrame(now, time, size.columns, size.rows)
        art = <Raster key={ART} columns={frame.columns} rows={frame.rows} cells={frame.cells} />
        mode = `Raster ${size.columns}x${size.rows * 2} px`
      }
    } else if ('Svg' in table) {
      const { Svg } = table
      art = <Svg source={sceneSvg(now)} alt={`Animated ${now.scene} scene in the ${now.palette.name} palette`} isInteractive />
      mode = 'Svg + SMIL'
    }

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold>{title.map((c, i) => <Text key={`t${i}`} color={c.color}>{c.char}</Text>)}</Text>
          <Text>{swatch.map((color, i) => <Text key={`s${i}`} backgroundColor={color}> </Text>)}</Text>
        </Box>
        {art}
        <Text>
          <Text color={title[0]!.color} bold>{now.scene}</Text>
          <Text dimColor>{' / '}</Text>
          <Text color={title[8]!.color} bold>{now.palette.name}</Text>
          <Text dimColor>{`  ${mode}${isPaused ? '  paused' : ''}`}</Text>
        </Text>
        {note ? <Text color="yellow">{note}</Text> : null}
        <Box flexDirection="row" gap={1}>
          <Button key="scene" label="Scene" hotkey="s" variant="primary" onPress={() => { act($, 'scene') }} />
          <Button key="palette" label="Palette" hotkey="p" onPress={() => { act($, 'palette') }} />
          {isTerminal ? <Button key="mode" label={isImage ? 'Raster' : 'Image'} hotkey="m" onPress={() => { setImage($, !isImage) }} /> : null}
          <Button key="pause" label={isPaused ? 'Play' : 'Pause'} hotkey="k" onPress={() => { act($, 'pause') }} />
          <Button key="close" label="Close" hotkey="x" onPress={() => { stop(); void $.ui.close({ id: PANE }) }} />
        </Box>
      </Box>
    )
  })
}
