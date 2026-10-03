import type { Register } from 'claude-code'

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'send-probe', description: 'Send args to the session id in the first word' })
    return next(e)
  })
  on('command.run', { command: 'send-probe' }, async ($, e, next) => {
    const [sessionId = '', ...rest] = e.args.split(' ')
    const r = await $.session.send({ to: { sessionId }, text: rest.join(' ') })
    return { text: `send-probe: ${JSON.stringify(r)}` }
  })
}
