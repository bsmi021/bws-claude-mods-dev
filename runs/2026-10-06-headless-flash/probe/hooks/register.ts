import type { EngineInterface, Register } from 'claude-code'

const LOG = 'C:/Projects/bws.mods.claude-code/runs/2026-10-06-headless-flash/receipts/probe.log'
const PS =
  "Add-Type 'using System;using System.Runtime.InteropServices;public class W{[DllImport(\"kernel32\")]public static extern IntPtr GetConsoleWindow();[DllImport(\"user32\")]public static extern bool IsWindowVisible(IntPtr h);}'; " +
  '$h=[W]::GetConsoleWindow(); "hwnd=$h visible=$(if($h -ne [IntPtr]::Zero){[W]::IsWindowVisible($h)}else{\'n/a\'}) pid=$PID"'

async function log($: EngineInterface, line: string) {
  let prev = ''
  try {
    prev = await $.fs.read(LOG)
  } catch {
    prev = ''
  }
  await $.fs.write(LOG, `${prev}${line}\n`)
}

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    const s = await $.session.surfaces()
    await log($, `session.start surfaces=${s.length} ${JSON.stringify(s)}`)
    return next(e)
  })
  on('prompt.submit', async ($, e, next) => {
    const s = await $.session.surfaces()
    let child = ''
    try {
      const r = await $.process.run(['powershell', '-NoProfile', '-NonInteractive', '-Command', PS], { timeoutMs: 20000 })
      child = r.stdout.trim()
    } catch (err) {
      child = `ERR ${String(err)}`
    }
    await log($, `prompt.submit surfaces=${s.length} child: ${child}`)
    return next(e)
  })
}
