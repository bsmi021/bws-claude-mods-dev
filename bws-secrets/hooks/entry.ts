// The masked entry: a Client surface module (DECISIONS.md D7). It keeps what the person types in its own local state,
// draws one dot per character and posts the value once, on Enter, to this plugin's `ui.message`. Nothing typed is drawn.
import type { ClientKeyEvent, ClientSurface, RenderElement } from 'claude-code'

export type EntryState = { value: string }

export const DOT = '•'
const SHOWN = 32
const SPECIAL = new Set([
  'up', 'down', 'left', 'right', 'tab', 'pageup', 'pagedown', 'home', 'end', 'escape', 'insert', 'return', 'enter',
  'backspace', 'delete',
])

// One key against the typed value: a character (or a pasted run) is added, Backspace/Delete take the last one off,
// Ctrl+U clears, Enter submits. Arrows and other named keys change nothing.
export function keyStep(value: string, k: ClientKeyEvent): { value: string; submit?: true } {
  if (k.key === 'return' || k.key === 'enter') return { value, submit: true }
  if (k.key === 'backspace' || k.key === 'delete') return { value: [...value].slice(0, -1).join('') }
  if (k.ctrl && k.key === 'u') return { value: '' }
  if (k.ctrl || k.meta) return { value }
  if (k.key === 'space') return { value: `${value} ` }
  if (SPECIAL.has(k.key) || /^f\d{1,2}$/.test(k.key)) return { value }
  return { value: value + k.key.replace(/[\r\n]/g, '') }
}

export function dots(value: string): string {
  const n = [...value].length
  return n > SHOWN ? `${DOT.repeat(SHOWN)} +${n - SHOWN}` : DOT.repeat(n)
}

export default function SecretEntry(props: unknown, surface: ClientSurface<EntryState>): RenderElement {
  const { Box, Text } = surface.elements
  if (surface.state === undefined) {
    surface.onKey(k => {
      const step = keyStep(surface.state?.value ?? '', k)
      if (step.submit) {
        if (step.value !== '') surface.post({ secret: step.value })
        surface.setState({ value: '' })
        return
      }
      surface.setState({ value: step.value })
    })
    surface.setState({ value: '' })
  }
  const shown = dots(surface.state?.value ?? '')
  return Box({
    borderStyle: 'round',
    paddingX: 1,
    children: [shown === '' ? Text({ dimColor: true, children: 'click here, type the value, press Enter' }) : Text({ children: shown })],
  })
}
