// M8 spike 2: can a tool.call hook serving a registered tool wait 15 s for something (a person) past its 10 s budget?
// wait_plain: awaits a plain promise that a $.clock.after callback resolves after 15 s.
// wait_proc: loops on $.process.run of a ~1 s sleeper (a $ call in flight stops the hook's clock) until 15 s passed.
import type { Register } from 'claude-code'

const WAIT_MS = 15_000

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    await $.tool.register({ name: 'wait_plain', description: 'Spike tool. Call it with no arguments.', isDeferred: false })
    await $.tool.register({ name: 'wait_proc', description: 'Spike tool. Call it with no arguments.', isDeferred: false })
    return next(e)
  })

  on('tool.call', { tool: 'mcp__bws-secrets-spike__wait_plain' }, async ($, e) => {
    const t0 = await $.clock.now()
    await new Promise<void>(resolve => {
      void $.clock.after(WAIT_MS, () => resolve())
    })
    const t1 = await $.clock.now()
    return { result: `wait_plain answered by the hook after ${t1 - t0} ms` }
  })

  on('tool.call', { tool: 'mcp__bws-secrets-spike__wait_proc' }, async ($, e) => {
    const t0 = await $.clock.now()
    const isWin = (await $.env.get('OS')) === 'Windows_NT'
    let n = 0
    while ((await $.clock.now()) - t0 < WAIT_MS) {
      n++
      if (isWin) await $.process.run(['ping', '-n', '2', '127.0.0.1'], { timeoutMs: 5000 })
      else await $.process.run(['sleep', '1'], { timeoutMs: 5000 })
    }
    const t1 = await $.clock.now()
    return { result: `wait_proc answered by the hook after ${t1 - t0} ms, ${n} sleeps` }
  })
}
