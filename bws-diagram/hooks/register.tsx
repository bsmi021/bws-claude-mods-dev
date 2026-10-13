// bws-diagram: after a big turn a small model decides whether it is worth a diagram; if so a fork draws what happened
// in a side pane. Mermaid blocks Claude writes are pinned there too. The only file that uses `$`.
import { atom, update } from 'claude-code'
import type { Register } from 'claude-code'

const summary = atom({ plugin: 'bws-diagram', key: 'summary' } as const, null)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await update($, summary, () => null)
    return next(e)
  })
}
