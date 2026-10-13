// M8 spike (FR-SB-01). Three ways to get a value into a Bash command and keep it out of the record.
// A: tool.call rewrite with the value inline in the rewritten command (no result rewrite).
// B: tool.call rewrite that makes the shell read the value from a file; the hook rewrites the result it returns.
// D: $.env.set before next, unset after; the command reads $SPIKE_D, no file, no value in the text.
// C: as B for the command, but no result rewrite in tool.call; session.append scrubs the tool-result row instead.
import type { Register } from 'claude-code'

const RUN = 'C:/Projects/bws.mods.claude-code-loop/runs/2026-10-13-mods-m8-secrets/spike'
const FILE = 'C:/Users/bsmi0/AppData/Local/Temp/bws-m8-spike/secrets.env'
const A = 'spkAAA-7731'
const B = 'spkBBB-4402'
const C = 'spkCCC-9915'
const D = 'spkDDD-5068'

function fromFile(name: string): string {
  return `export ${name}="$(sed -n 's/^${name}=//p' '${FILE}')"; `
}

function scrub(text: string, value: string, name: string): string {
  const forms = [value, btoa(value), encodeURIComponent(value)]
  let out = text
  for (const f of forms) out = out.split(f).join(`{{secret:${name}}}`)
  return out
}

function scrubBlocks(content: unknown): unknown {
  if (typeof content === 'string') return scrub(content, C, 'SPIKE_C')
  if (!Array.isArray(content)) return content
  return content.map((b: any) => {
    if (b && b.type === 'text' && typeof b.text === 'string') return { ...b, text: scrub(b.text, C, 'SPIKE_C') }
    if (b && b.type === 'tool_result') return { ...b, content: scrubBlocks(b.content) }
    return b
  })
}

export function register(on: Register) {
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (e.tool !== 'Bash') return next(e)
    const cmd = e.command
    if (cmd.includes('{{secret:SPIKE_A}}')) {
      const command = `export SPIKE_A='${A}'; ` + cmd.split('{{secret:SPIKE_A}}').join('$SPIKE_A')
      return next({ ...e, command })
    }
    if (cmd.includes('{{secret:SPIKE_B}}')) {
      const command = fromFile('SPIKE_B') + cmd.split('{{secret:SPIKE_B}}').join('$SPIKE_B')
      const r = await next({ ...e, command })
      if (r.deny !== undefined || r.isError) return r
      const res = r.result as { stdout: string; stderr: string; interrupted: boolean }
      return {
        result: { ...res, stdout: scrub(res.stdout, B, 'SPIKE_B'), stderr: scrub(res.stderr, B, 'SPIKE_B') },
        ...(r.context ? { context: r.context } : {}),
      } as any
    }
    if (cmd.includes('{{secret:SPIKE_D}}')) {
      const command = cmd.split('{{secret:SPIKE_D}}').join('$SPIKE_D')
      await $.env.set('SPIKE_D', D)
      let r
      try {
        r = await next({ ...e, command })
      } finally {
        await $.env.set('SPIKE_D', undefined)
      }
      if (r.deny !== undefined || r.isError) return r
      const res = r.result as { stdout: string; stderr: string; interrupted: boolean }
      return { result: { ...res, stdout: scrub(res.stdout, D, 'SPIKE_D'), stderr: scrub(res.stderr, D, 'SPIKE_D') } } as any
    }
    if (cmd.includes('{{secret:SPIKE_C}}')) {
      const command = fromFile('SPIKE_C') + cmd.split('{{secret:SPIKE_C}}').join('$SPIKE_C')
      return next({ ...e, command })
    }
    return next(e)
  })

  on('session.append', { door: 'tool-result' }, async ($, e, next) => {
    const content = scrubBlocks(e.message.content) as typeof e.message.content
    return next({ ...e, message: { ...e.message, content } })
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (!e.agentId) {
      const id = await $.session.id()
      const rows = await $.session.messages()
      const api = await $.session.messages({ as: 'api' })
      await $.fs.write(`${RUN}/messages-dump.json`, JSON.stringify({ id, rows, api }, null, 1))
    }
    return r
  })
}
