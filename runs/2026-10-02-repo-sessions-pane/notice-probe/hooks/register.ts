import type { EngineInterface, Register } from 'claude-code'

const LOG = 'C:/Projects/bws.mods.claude-code/runs/2026-10-02-repo-sessions-pane/receipts/notice-probe.log'

async function log($: EngineInterface, line: string) {
  let prev = ''
  try {
    prev = await $.fs.read(LOG)
  } catch {
    prev = ''
  }
  await $.fs.write(LOG, `${prev}${new Date(await $.clock.now()).toISOString()} ${line}\n`)
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'probe-send', description: 'Send args after the first word to the session id in the first word' })
    await log($, `session.start ${await $.session.id()}`)
    return next(e)
  })
  on('command.run', { command: 'probe-send' }, async ($, e, next) => {
    const [sessionId = '', ...rest] = e.args.split(' ')
    const results: string[] = []
    for (const text of rest.join(' ').split(' | ')) {
      await log($, `send to ${sessionId}: ${text}`)
      const r = await $.session.send({ to: { sessionId }, text })
      await log($, `send result ${JSON.stringify(r)}`)
      results.push(JSON.stringify(r))
    }
    return { text: `probe-send: ${results.join(' ')}` }
  })
  on('prompt.submit', async ($, e, next) => {
    await log($, `prompt.submit origin=${JSON.stringify(e.origin)} wait=${e.wait} text=${JSON.stringify(e.text.slice(0, 400))}`)
    return next(e)
  })
  on('session.receive', async ($, e, next) => {
    await log($, `session.receive origin=${JSON.stringify(e.origin)} text=${JSON.stringify(e.text.slice(0, 400))}`)
    return next(e)
  })
  on('session.append', async ($, e, next) => {
    const raw = JSON.stringify(e)
    if (raw.includes('delivery notice')) await log($, `session.append ${raw.slice(0, 500)}`)
    return next(e)
  })
}
