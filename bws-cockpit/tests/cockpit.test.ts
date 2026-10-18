import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { countOpen, parseAdb, parseFinish, parseNext, parseProcs, parseUnrealMcpUrl } from '../hooks/lib'
import { addLowVram, adbNeedsDevice, findUeGuiLaunch, fixUnityLaunch, isUnityPipelineCommand } from '../hooks/shell'

// ---------- the world beneath the plugin ----------

type World = {
  procs?: string // name|pid|cmdline lines
  vram?: string
  adb?: string | null // null: adb missing
  mcpJson?: string
  isMcpUp?: boolean
  files?: Record<string, string>
  dirs?: Record<string, { name: string; kind: 'file' | 'dir'; mtimeMs: number }[]>
  surfaces?: string[]
}

const CWD = 'C:/proj'
let clockStart = 1_000_000

// Stubs every outside call the mod makes, and records the tool calls that reach the bottom.
function world(on: On, w: World) {
  clockStart += 1_000_000
  const clock = mock.clock(on, { now: clockStart })
  const reached: { tool: string; command?: string }[] = []
  on('ui.toast', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: CWD }))
  on('session.surfaces', () => ({ value: (w.surfaces ?? []) as never }))
  on('process.run', ($, e) => {
    const exe = String(e.argv[0])
    const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
    if (exe === 'powershell') return ok(w.procs ?? '')
    if (exe === 'nvidia-smi') return ok(w.vram ?? '1000, 8188')
    if (w.adb === null) throw new Error('ENOENT adb')
    return ok(w.adb ?? 'List of devices attached\n\n')
  })
  on('fs.read', ($, e) => {
    const path = String(e.path).replace(/\\/g, '/')
    if (path === `${CWD}/.mcp.json` && w.mcpJson !== undefined) return { value: w.mcpJson as never }
    const hit = w.files?.[path]
    if (hit !== undefined) return { value: hit as never }
    throw new Error(`ENOENT ${path}`)
  })
  on('fs.list', ($, e) => {
    const path = String(e.path).replace(/\\/g, '/')
    const hit = w.dirs?.[path]
    if (!hit) throw new Error(`ENOENT ${path}`)
    return { value: hit.map(d => ({ ...d, size: 1, isLink: false })) }
  })
  on('http.fetch', () => {
    if (w.isMcpUp) return { value: { status: 406, ok: false, headers: {}, text: '' } }
    throw new Error('ECONNREFUSED')
  })
  on('tool.call', ($, e) => {
    reached.push({ tool: String(e.tool), command: (e as { command?: string }).command })
    return { result: { stdout: 'ran', stderr: '' } as never }
  })
  return Object.assign(reached, { clock })
}

const MCP_HTTP = JSON.stringify({ mcpServers: { 'unreal-mcp': { type: 'http', url: 'http://127.0.0.1:3091/mcp' } } })
const UE = 'C:/Program Files/Epic Games/UE_5.8/Engine/Binaries/Win64/UnrealEditor.exe'

// ---------- pure helpers ----------

describe('parsing', () => {
  test('next step: last explicit Next line wins, else the bullet under a next heading', () => {
    expect(parseNext('- Next: build band\nlater\n**Next step:** run tests')).toBe('run tests')
    expect(parseNext('## Status / next step\n\n- the user picks mods\n## Other\n- x')).toBe('the user picks mods')
    expect(parseNext('# nothing here')).toBeUndefined()
  })
  test('finish line, open items', () => {
    expect(parseFinish('## Finish line (all true)\n1. validate passes\n2. tests')).toBe('validate passes')
    expect(countOpen('- [ ] a\n- [x] b\n  * [ ] c\n[ ] not a bullet')).toBe(2)
  })
  test('probe output', () => {
    expect(parseAdb('List of devices attached\nR5CT 	device\nemulator-5554\toffline\n')).toEqual({ ready: ['R5CT'], other: ['emulator-5554 offline'] })
    expect(parseProcs('UnrealEditor.exe|42|"C:/UE/UnrealEditor.exe" "C:/p/MyGame.uproject"\r\n\r\n')[0]?.pid).toBe(42)
    const proxy = JSON.stringify({ mcpServers: { 'unreal-mcp': { type: 'stdio', command: 'python', args: ['proxy.py', 'http://127.0.0.1:3092/mcp'] } } })
    expect(parseUnrealMcpUrl(proxy)).toBe('http://127.0.0.1:3092/mcp')
    expect(parseUnrealMcpUrl(MCP_HTTP, 'unreal-engine')).toBeUndefined()
    expect(parseUnrealMcpUrl('not json')).toBeUndefined()
  })
})

describe('command classification', () => {
  test('adb: device commands vs. safe ones', () => {
    expect(adbNeedsDevice('adb shell input tap 1 2')).toBe(true)
    expect(adbNeedsDevice('"C:\\Android\\Sdk\\platform-tools\\adb.exe" -s R5CT install app.apk')).toBe(true)
    expect(adbNeedsDevice('adb devices -l')).toBe(false)
    expect(adbNeedsDevice('adb kill-server && adb start-server')).toBe(false)
    expect(adbNeedsDevice('grep -r loadbalancer src')).toBe(false)
  })
  test('unity pipeline commands', () => {
    expect(isUnityPipelineCommand('unity --format json command --project-path C:/p recompile')).toBe(true)
    expect(isUnityPipelineCommand('timeout 300 unity command eval --code "return 1;"')).toBe(true)
    expect(isUnityPipelineCommand('unity open C:/p --args -automated')).toBe(false)
    expect(isUnityPipelineCommand('echo community command')).toBe(false)
  })
  test('unity launches get -automated', () => {
    expect(fixUnityLaunch('unity open C:/Projects/my-unity-game && echo ok')).toEqual({
      command: 'unity open C:/Projects/my-unity-game --args -automated && echo ok',
      note: 'added -automated to unity open',
    })
    expect(fixUnityLaunch("unity open 'C:/p' --args -logFile x.log")).toMatchObject({ command: "unity open 'C:/p' --args -automated -logFile x.log" })
    expect(fixUnityLaunch('"C:/Unity/6000.6.0f1/Editor/Unity.exe" -projectPath C:/p -logFile -')).toMatchObject({
      command: '"C:/Unity/6000.6.0f1/Editor/Unity.exe" -projectPath C:/p -logFile - -automated',
    })
    expect(fixUnityLaunch('Start-Process -FilePath "unity" -ArgumentList "open","C:\\p"')).toHaveProperty('deny')
    expect(fixUnityLaunch('unity open C:/p --args -automated')).toBeUndefined()
    expect(fixUnityLaunch('unity --format json command --project-path C:/p recompile')).toBeUndefined()
  })
  test('UE GUI launches only', () => {
    expect(findUeGuiLaunch(`"${UE}" "C:/Projects/my-ue-game/MyGame.uproject" -log &`)?.uproject).toBe('C:/Projects/my-ue-game/MyGame.uproject')
    expect(findUeGuiLaunch(`"${UE.replace('UnrealEditor.exe', 'UnrealEditor-Cmd.exe')}" C:/p/x.uproject -run=pythonscript`)).toBeUndefined()
    expect(findUeGuiLaunch(`"${UE}" C:/p/x.uproject -run=pythonscript -script=a.py -nullrhi`)).toBeUndefined()
    expect(findUeGuiLaunch('Get-Process UnrealEditor.exe -EA SilentlyContinue')).toBeUndefined()
    expect(findUeGuiLaunch(`Start-Process -FilePath "${UE}" -ArgumentList '"C:/p/x.uproject"'`)?.isStartProcess).toBe(true)
  })
})

describe('command position only (false-positive shapes from the 30-day replay)', () => {
  test('mentions are not invocations', () => {
    expect(findUeGuiLaunch(`echo "${UE}" "C:/p/x.uproject"`)).toBeUndefined()
    expect(findUeGuiLaunch(`Get-CimInstance Win32_Process -Filter "Name='UnrealEditor.exe'" | Select ProcessId,CommandLine`, 'powershell')).toBeUndefined()
    expect(findUeGuiLaunch(`$editor='C:\\Program Files\\Epic Games\\UE_5.8\\Engine\\Binaries\\Win64\\UnrealEditor.exe'; $project='C:\\p\\x.uproject'`, 'powershell')).toBeUndefined()
    expect(findUeGuiLaunch(`$ed = "${UE}"\n$proj = "C:\\p\\x.uproject"`, 'powershell')).toBeUndefined()
    expect(findUeGuiLaunch(`cat > launch.sh <<'EOF'\n"${UE}" "C:/p/x.uproject"\nEOF\nchmod +x launch.sh`)).toBeUndefined()
    expect(findUeGuiLaunch(`# "${UE}" "C:/p/x.uproject"\nls`)).toBeUndefined()
    expect(fixUnityLaunch('git commit -m "docs: unity open needs -automated"')).toBeUndefined()
    expect(fixUnityLaunch(`$exe = 'C:\\Program Files\\Unity\\Hub\\Editor\\6000.5.1f1\\Editor\\Unity.exe'`, 'powershell')).toBeUndefined()
    expect(fixUnityLaunch('unity open --help 2>&1 | head -25')).toBeUndefined()
    expect(fixUnityLaunch(`"/c/Program Files/Unity/Hub/Editor/6000.6.0f1/Editor/Unity.exe" -batchmode -quit -projectPath C:/p -executeMethod B.Run`)).toBeUndefined()
    expect(isUnityPipelineCommand(`python - <<'PY'\nprint("unity command eval")\nPY`)).toBe(false)
    expect(adbNeedsDevice('grep -rn "adb shell" src')).toBe(false)
    expect(adbNeedsDevice(`git commit -q -F - <<'EOF'\nfix: adb shell input tap now works\nEOF`)).toBe(false)
  })
  test('real invocations behind wrappers are found', () => {
    expect(adbNeedsDevice('export MSYS_NO_PATHCONV=1; ADB=/c/Android/Sdk/platform-tools/adb.exe $ADB shell am force-stop x')).toBe(true)
    expect(adbNeedsDevice('n=$(adb shell pidof com.example.app)')).toBe(true)
    expect(isUnityPipelineCommand('cd C:/p && timeout 120 unity --format json command --project-path C:/p test_status 2>&1 | head')).toBe(true)
    expect(findUeGuiLaunch(`(nohup "${UE}" 'C:\\p\\x.uproject' > /dev/null 2>&1 &)`)?.uproject).toBe('C:\\p\\x.uproject')
    expect(findUeGuiLaunch(`$p = Start-Process -FilePath "${UE}" -ArgumentList '"C:\\p\\x.uproject"' -PassThru`, 'powershell')?.isStartProcess).toBe(true)
  })
  test('appended flags land before redirects and line continuations', () => {
    const cmd = `"${UE}" \\\n  "C:/p/x.uproject" -nosplash \\\n  > "$R/log.txt" 2>&1 &`
    const launch = findUeGuiLaunch(cmd)
    expect(launch).toBeDefined()
    const out = addLowVram(cmd, launch!, ['t.MaxFPS=30'])
    expect(out).toBe(`"${UE}" \\\n  "C:/p/x.uproject" -nosplash -ini:Engine:[SystemSettings]:t.MaxFPS=30 \\\n  > "$R/log.txt" 2>&1 &`)
    expect(fixUnityLaunch("(unity open 'C:/p' > launch.json 2>&1 &)")).toMatchObject({ command: "(unity open 'C:/p' --args -automated > launch.json 2>&1 &)" })
  })
})

// ---------- guard hooks ----------

describe('guard', () => {
  test('unreal-mcp call is blocked when the port is down', async ($, on) => {
    const reached = world(on, { mcpJson: MCP_HTTP, isMcpUp: false })
    const r = await $.tool.call({ tool: 'mcp__unreal-mcp__call_tool', toolset: 'x' } as never)
    expect(r.deny ?? r.text ?? '').toMatch(/127\.0\.0\.1:3091.*not reachable/)
    expect(reached.length).toBe(0)
  })

  test('unreal-mcp call passes when the port answers', async ($, on) => {
    const reached = world(on, { mcpJson: MCP_HTTP, isMcpUp: true })
    await $.tool.call({ tool: 'mcp__unreal-mcp__list_toolsets' } as never)
    expect(reached.map(r => r.tool)).toEqual(['mcp__unreal-mcp__list_toolsets'])
  })

  test('unreal-mcp call passes when the project has no unreal-mcp config', async ($, on) => {
    const reached = world(on, {})
    await $.tool.call({ tool: 'mcp__unreal-mcp__list_toolsets' } as never)
    expect(reached.length).toBe(1)
  })

  test('adb device command is blocked with no ready device; adb devices passes', async ($, on) => {
    const reached = world(on, { adb: 'List of devices attached\nR5CT\tunauthorized\n' })
    const r = await $.tool.call({ tool: 'Bash', command: 'adb shell screencap -p /sdcard/s.png' })
    expect(r.deny ?? r.text ?? '').toMatch(/no Android device is ready.*R5CT unauthorized/)
    await $.tool.call({ tool: 'Bash', command: 'adb devices' })
    expect(reached.map(c => c.command)).toEqual(['adb devices'])
  })

  test('adb passes with a ready device, and when adb is missing', async ($, on) => {
    const reached = world(on, { adb: 'List of devices attached\nR5CT\tdevice\n' })
    await $.tool.call({ tool: 'Bash', command: 'adb shell echo hi' })
    expect(reached.length).toBe(1)
  })

  test('unity open gets -automated and the model is told', async ($, on) => {
    const reached = world(on, {})
    const r = await $.tool.call({ tool: 'Bash', command: 'unity open C:/Projects/my-unity-game' })
    expect(reached[0]?.command).toBe('unity open C:/Projects/my-unity-game --args -automated')
    expect((r.context ?? []).join(' ')).toMatch(/added -automated to unity open/)
  })

  test('unity CLI pipeline command is blocked with no editor running', async ($, on) => {
    const reached = world(on, { procs: '' })
    const r = await $.tool.call({ tool: 'Bash', command: 'unity --format json command --project-path C:/p recompile' })
    expect(r.deny ?? r.text ?? '').toMatch(/no Unity editor is running/)
    expect(reached.length).toBe(0)
  })

  test('unity CLI pipeline command passes with an editor running', async ($, on) => {
    const reached = world(on, { procs: 'Unity.exe|7|"C:/Unity/Unity.exe" -projectPath C:/p -automated' })
    await $.tool.call({ tool: 'PowerShell', command: 'unity command eval --code "return 1;"' })
    expect(reached.length).toBe(1)
  })

  test('UE launch under GPU pressure gets the low-VRAM -ini overrides', async ($, on) => {
    const reached = world(on, { procs: 'blender.exe|9|blender', vram: '4662, 8188' })
    const cmd = `"${UE}" "C:/Projects/my-ue-game/MyGame.uproject" -log > /dev/null 2>&1 &`
    const r = await $.tool.call({ tool: 'Bash', command: cmd })
    const ran = reached[0]?.command ?? ''
    expect(ran).toContain('"C:/Projects/my-ue-game/MyGame.uproject" -log -ini:Engine:[SystemSettings]:t.MaxFPS=30,')
    expect(ran).toContain('[SystemSettings]:r.ScreenPercentage=50')
    expect(ran.endsWith('> /dev/null 2>&1 &')).toBe(true)
    expect((r.context ?? []).join(' ')).toMatch(/low-VRAM/)
  })

  test('UE launch with no pressure is left alone', async ($, on) => {
    const reached = world(on, { procs: '', vram: '900, 8188' })
    const cmd = `"${UE}" "C:/p/x.uproject"`
    await $.tool.call({ tool: 'Bash', command: cmd })
    expect(reached[0]?.command).toBe(cmd)
  })

  test('a second editor for an open .uproject is blocked', async ($, on) => {
    const reached = world(on, { procs: `UnrealEditor.exe|501|"${UE}" "C:\\Projects\\my-ue-game\\MyGame.uproject" -log` })
    const r = await $.tool.call({ tool: 'PowerShell', command: `& "${UE}" "C:/Projects/my-ue-game/MyGame.uproject"` })
    expect(r.deny ?? r.text ?? '').toMatch(/already open in UnrealEditor \(pid 501\)/)
    expect(reached.length).toBe(0)
  })

  test('Start-Process UE launch under pressure is refused with the argument to add', async ($, on) => {
    world(on, { procs: 'blender.exe|9|blender' })
    const r = await $.tool.call({ tool: 'PowerShell', command: `Start-Process -FilePath "${UE}" -ArgumentList '"C:/p/x.uproject"','-log'` })
    expect(r.deny ?? r.text ?? '').toMatch(/-ini:Engine:\[SystemSettings\]:t\.MaxFPS=30/)
  })

  // The 10-06 retry: the overrides sat in a $args array passed as -ArgumentList $args, and were blocked again.
  test('a Start-Process retry whose $args already carry the overrides passes', async ($, on) => {
    const reached = world(on, { procs: 'blender.exe|9|blender', vram: '4100, 8188' })
    const cmd =
      `$args = @("C:\\p\\x.uproject", "-nosplash", '-ini:Engine:[SystemSettings]:t.MaxFPS=30,[SystemSettings]:r.ScreenPercentage=50')\n` +
      `Start-Process -FilePath "${UE}" -ArgumentList $args -PassThru | Select-Object Id`
    const r = await $.tool.call({ tool: 'PowerShell', command: cmd })
    expect(r.deny).toBeUndefined()
    expect(reached[0]?.command).toBe(cmd)
  })

  test('an unattended render run under pressure is left alone (no 50% screen on a capture)', async ($, on) => {
    const reached = world(on, { procs: 'blender.exe|9|blender', vram: '4100, 8188' })
    const cmd =
      `$args = @("C:\\p\\x.uproject", "/Game/Maps/L_Promo", "-nosplash", "-unattended", "-nosound", "-ini:Engine:[/Script/PythonScriptPlugin.PythonScriptPluginSettings]:+StartupScripts=C:/p/render_promo.py")\n` +
      `Start-Process -FilePath "${UE}" -ArgumentList $args -PassThru`
    const r = await $.tool.call({ tool: 'PowerShell', command: cmd })
    expect(r.deny).toBeUndefined()
    expect(reached[0]?.command).toBe(cmd)
  })

  test('an explicit full-quality screen percentage is respected', async ($, on) => {
    const reached = world(on, { procs: 'blender.exe|9|blender', vram: '4100, 8188' })
    const cmd = `"${UE}" "C:/p/x.uproject" -ExecCmds="r.ScreenPercentage 100,t.MaxFPS 60" &`
    await $.tool.call({ tool: 'Bash', command: cmd })
    expect(reached[0]?.command).toBe(cmd)
  })

  test('a Python startup-script -ini is not mistaken for the low-VRAM overrides', () => {
    const launch = findUeGuiLaunch(`"${UE}" "C:/p/x.uproject" -ini:Engine:[/Script/PythonScriptPlugin.PythonScriptPluginSettings]:+StartupScripts=C:/p/a.py`)
    expect(launch?.hasOverrides).toBe(false)
    expect(launch?.isRender).toBe(false)
  })

  test('unrelated tools and commands pass untouched', async ($, on) => {
    const reached = world(on, { procs: 'blender.exe|9|blender', adb: 'List of devices attached\n\n' })
    await $.tool.call({ tool: 'Bash', command: 'ls -la && git status' })
    await $.tool.call({ tool: 'Read', file_path: 'C:/proj/README.md' } as never)
    await $.tool.call({ tool: 'Bash', command: 'grep -rn "community" docs' })
    expect(reached.map(c => c.tool)).toEqual(['Bash', 'Read', 'Bash'])
    expect(reached[0]?.command).toBe('ls -la && git status')
  })

  test('guard off lets everything through', { options: { guard: false } }, async ($, on) => {
    const reached = world(on, { adb: 'List of devices attached\n\n', mcpJson: MCP_HTTP, isMcpUp: false })
    await $.tool.call({ tool: 'Bash', command: 'adb shell ls' })
    await $.tool.call({ tool: 'Bash', command: 'unity open C:/p' })
    expect(reached.map(c => c.command)).toEqual(['adb shell ls', 'unity open C:/p'])
  })
})

// ---------- run cockpit ----------

const RUN_WORLD: World = {
  dirs: {
    [`${CWD}/runs`]: [
      { name: '2026-09-30-old', kind: 'dir', mtimeMs: 0 },
      { name: '2026-10-02-bow-fix', kind: 'dir', mtimeMs: 0 },
      { name: 'notes.md', kind: 'file', mtimeMs: 5 },
    ],
    [`${CWD}/runs/2026-09-30-old`]: [{ name: 'RUNLOG.md', kind: 'file', mtimeMs: 100 }],
    [`${CWD}/runs/2026-10-02-bow-fix`]: [
      { name: 'RUNLOG.md', kind: 'file', mtimeMs: 300 },
      { name: 'PLAN.md', kind: 'file', mtimeMs: 200 },
    ],
  },
  files: {
    [`${CWD}/runs/2026-10-02-bow-fix/RUNLOG.md`]: '# RUNLOG\n- Next: verify the draw anim in PIE\n',
    [`${CWD}/runs/2026-10-02-bow-fix/PLAN.md`]: '## Finish line\n- bow draws and fires in PIE\n- [ ] draw anim\n- [ ] projectile\n- [x] grip\n',
  },
}

describe('cockpit', () => {
  test('/cockpit reports the newest run and device status', async ($, on) => {
    world(on, { ...RUN_WORLD, procs: 'blender.exe|9|blender', vram: '4662, 8188' })
    const r = await $.command.run({ command: 'cockpit', args: '' } as never)
    expect(r.text).toContain('Run: runs/2026-10-02-bow-fix')
    expect(r.text).toContain('Finish line: bow draws and fires in PIE')
    expect(r.text).toContain('Next: verify the draw anim in PIE')
    expect(r.text).toContain('Open items: 2')
    expect(r.text).toMatch(/Blender open.*VRAM 4\.6\/8\.0 GB.*pressure/)
  })

  test('/cockpit with no runs folder says so', async ($, on) => {
    world(on, {})
    const r = await $.command.run({ command: 'cockpit', args: '' } as never)
    expect(r.text).toContain('No run folder')
  })

  test('/resume-run submits a resume prompt naming the run', async ($, on) => {
    const w = world(on, RUN_WORLD)
    const sent: string[] = []
    on('prompt.submit', ($, e) => {
      sent.push(e.text)
      return { text: e.text } as never
    })
    const r = await $.command.run({ command: 'resume-run', args: '' } as never)
    expect(r.text).toContain('Resuming runs/2026-10-02-bow-fix')
    await w.clock.advance(100)
    expect(sent[0] ?? '').toMatch(/^Resume run runs\/2026-10-02-bow-fix\./)
  })

  test('prompt.context adds one cockpit block in an attended session', async ($, on) => {
    world(on, { ...RUN_WORLD, surfaces: ['terminal'] })
    on('prompt.context', ($, e) => ({ blocks: e.blocks }))
    const r = await $.prompt.context({ blocks: [{ name: 'currentDate', text: 'today' }] } as never)
    const block = r.blocks.find(b => b.name === 'bwsCockpit')
    expect(block?.text).toMatch(/runs\/2026-10-02-bow-fix; next step: verify the draw anim in PIE; 2 open items/)
    expect(r.blocks.length).toBe(2)
  })

  test('claude -p (no surface) gets no run-folder block', async ($, on) => {
    world(on, { ...RUN_WORLD, surfaces: [] })
    on('prompt.context', ($, e) => ({ blocks: e.blocks }))
    const r = await $.prompt.context({ blocks: [{ name: 'currentDate', text: 'today' }] } as never)
    expect(r.blocks.map(b => b.name)).toEqual(['currentDate'])
  })

  test('the bar draws the run chip, live devices and the actions on terminal and desktop', async ($, on) => {
    world(on, { ...RUN_WORLD, surfaces: ['terminal'], procs: 'blender.exe|9|blender', vram: '1000, 8188' })
    await $.command.run({ command: 'cockpit', args: '' } as never) // fills the view
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({
        plugin: 'bws-cockpit',
        surface,
        component: 'AbovePrompt',
        props: { hasSurvey: false, isWorking: false, maxRows: 8, bodyColumns: 120, scroll: { offset: 0, bodyRows: 8 }, view: {} },
      })
      expect(await ui.find({ type: 'Text', text: /^bow-fix$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^ 2 open$/ })).toBeDefined()
      for (const label of ['Blender', 'VRAM']) expect(await ui.find({ type: 'Text', text: new RegExp(`^${label}$`) })).toBeDefined()
      // Off devices say nothing.
      for (const label of ['UE', 'Unity', 'adb']) expect(await ui.find({ type: 'Text', text: new RegExp(`^${label}$`) })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: /1\.0\/8\.0 GB/ })).toBeDefined()
      const keys: [string, string][] = [['resume', '1'], ['dash', '2'], ['tab-assumptions', 'a'], ['tab-shelf', 's'], ['handoff', 'h'], ['idea', 'i'], ['enhance', 'e'], ['hide', '3']]
      for (const [key, hotkey] of keys) expect((await ui.find({ key }))?.props?.hotkey).toBe(hotkey)
      expect(await ui.find({ key: 'tab-board' })).toBeUndefined() // bws-board not loaded
      expect(await ui.find({ key: 'loop' })).toBeUndefined() // no loop here
      expect(await ui.find({ key: 'refresh' })).toBeUndefined()
      expect(await ui.find({ key: 'tile-run' })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: /next|guard|RUN/ })).toBeUndefined()
      await ui.unmount()
    }
  })
})

const BAND = {
  plugin: 'bws-cockpit',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 8, bodyColumns: 80, scroll: { offset: 0, bodyRows: 8 }, view: {} },
} as const

describe('action bar', () => {
  test('board chip and button: bws-board summary; hidden when alone, warning when asked', async ($, on) => {
    world(on, { ...RUN_WORLD, procs: '', vram: '1000, 8188' })
    const summary = { value: null as null | { agents: number; openAsks: number; askedOfMe: number } }
    on('state.get', ($, e, next) => {
      const ref = e as unknown as { plugin?: string; key?: string }
      return ref.plugin === 'bws-board' && ref.key === 'summary' ? ({ value: { value: summary.value, version: 1 } } as never) : next(e)
    })
    await $.command.run({ command: 'cockpit', args: '' } as never)
    const mount = async (cols: number) => $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, bodyColumns: cols } })
    let ui = await mount(120)
    expect(await ui.find({ key: 'chip-board' })).toBeUndefined() // bws-board not loaded
    await ui.unmount()
    summary.value = { agents: 1, openAsks: 0, askedOfMe: 0 }
    ui = await mount(120)
    expect(await ui.find({ key: 'chip-board' })).toBeUndefined() // alone, nothing open
    expect((await ui.find({ key: 'tab-board' }))?.props?.hotkey).toBe('b') // loaded: the tab button shows
    await ui.unmount()
    summary.value = { agents: 3, openAsks: 2, askedOfMe: 1 }
    ui = await mount(120)
    expect(await ui.find({ type: 'Text', text: /^board 3 · 2 open · 1 for you$/ })).toBeDefined()
    const chip = await ui.find({ key: 'chip-board' })
    const dot = chip?.children[0] as { props?: { color?: string } } | undefined
    expect(dot?.props?.color).toBe('warning')
    await ui.unmount()
    summary.value = { agents: 2, openAsks: 0, askedOfMe: 0 }
    ui = await mount(89)
    expect(await ui.find({ type: 'Text', text: /^board 2 · 0 open$/ })).toBeDefined()
    await ui.unmount()
  })

  test('mod summaries draw no bar chips any more: they are dashboard tabs', async ($, on) => {
    world(on, { ...RUN_WORLD, procs: '', vram: '1000, 8188' })
    const atoms: Record<string, unknown> = {}
    on('state.get', ($, e, next) => {
      const ref = e as unknown as { plugin?: string; key?: string }
      return ref.key === 'summary' && ref.plugin !== undefined && ref.plugin in atoms ? ({ value: { value: atoms[ref.plugin], version: 1 } } as never) : next(e)
    })
    await $.command.run({ command: 'cockpit', args: '' } as never)
    const chips = async (surface: 'terminal' | 'desktop') => {
      const ui = await $.ui.mount({ ...BAND, surface, props: { ...BAND.props, bodyColumns: 140 } })
      const found = await Promise.all(['bws-memory', 'bws-diagram', 'bws-skillgate', 'bws-secrets'].map(async n => (await ui.find({ key: `chip-mod-${n}` })) !== undefined))
      const text = await ui.find({ type: 'Text', text: /memory updating/ })
      const secrets = await ui.find({ key: 'chip-mod-bws-secrets' })
      const dot = secrets?.children[0] as { props?: { color?: string } } | undefined
      await ui.unmount()
      return { found, hasText: text !== undefined, secretsColor: dot?.props?.color }
    }
    for (const surface of ['terminal', 'desktop'] as const) {
      expect((await chips(surface)).found).toEqual([false, false, false, false]) // none loaded
    }
    atoms['bws-memory'] = { state: 'busy', label: 'memory updating' }
    atoms['bws-diagram'] = { state: 'idle', label: 'diagram' }
    atoms['bws-skillgate'] = null
    atoms['bws-secrets'] = { state: 'warn', label: '2 secrets' }
    for (const surface of ['terminal', 'desktop'] as const) {
      const r = await chips(surface)
      expect(r.found).toEqual([false, false, false, false])
      expect(r.hasText).toBe(false)
    }
  })

  test('status row, then the actions grouped do / open / hide; rows wrap when narrow, on desktop too', async ($, on) => {
    world(on, { ...RUN_WORLD, procs: '' })
    await $.command.run({ command: 'cockpit', args: '' } as never)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: { ...BAND.props, bodyColumns: 60 } })
    for (const key of ['bar', 'actions']) {
      const row = await ui.find({ key })
      expect(row?.props?.flexDirection).toBe('row')
      expect(row?.props?.flexWrap).toBe('wrap')
    }
    expect(await ui.find({ key: 'signals' })).toBeUndefined() // nothing to signal here
    expect(await ui.find({ type: 'Text', text: /^bow-fix$/ })).toBeDefined()
    const actions = await ui.find({ key: 'actions' })
    expect(actions?.text).toMatch(/^do.*resume.*handoff.*idea.*enhance.*open.*dash.*asm.*shelf.*hide$/)
    await ui.unmount()
  })

  test('a long run name is cut with ASCII dots', async ($, on) => {
    world(on, {
      dirs: { [`${CWD}/runs`]: [{ name: '2026-10-02-a-very-long-run-folder-name-for-the-bar', kind: 'dir', mtimeMs: 0 }], [`${CWD}/runs/2026-10-02-a-very-long-run-folder-name-for-the-bar`]: [{ name: 'RUNLOG.md', kind: 'file', mtimeMs: 1 }] },
      files: { [`${CWD}/runs/2026-10-02-a-very-long-run-folder-name-for-the-bar/RUNLOG.md`]: '- Next: x\n' },
    })
    await $.command.run({ command: 'cockpit', args: '' } as never)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, bodyColumns: 120 } })
    const cut = await ui.find({ type: 'Text', text: /^a-very-long/ })
    expect(cut?.text.endsWith('...')).toBe(true)
    expect((cut?.text.length ?? 99) <= 28).toBe(true)
    await ui.unmount()
  })

  test('the guard note shows for ten minutes, then goes', async ($, on) => {
    const w = world(on, { ...RUN_WORLD, adb: 'List of devices attached\nR5CT\tunauthorized\n' })
    await $.command.run({ command: 'cockpit', args: '' } as never)
    await $.tool.call({ tool: 'Bash', command: 'adb shell ls' })
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /guard blocked adb/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^unauthorized$|^ unauthorized$/ })).toBeDefined()
    await ui.unmount()
    await w.clock.advance(11 * 60 * 1000)
    const later = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await later.find({ type: 'Text', text: /guard/ })).toBeUndefined()
    await later.unmount()
  })

  test('another mod\'s band shares the slot: drawn under ours, both whole', async ($, on) => {
    world(on, RUN_WORLD)
    // A second mod's band, beneath this plugin in the chain: what next(e) answers.
    on('ui.render', { component: 'AbovePrompt' }, () => ({
      type: 'Box',
      props: { flexDirection: 'row' },
      children: [{ type: 'Text', children: ['other band'] }, { type: 'Text', props: { dimColor: true }, children: [' · 3 todo'] }],
    }) as never)
    await $.command.run({ command: 'cockpit', args: '' } as never)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...BAND, surface })
      expect(await ui.find({ type: 'Text', text: /^bow-fix$/ })).toBeDefined() // ours
      expect(await ui.find({ key: 'resume' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^other band$/ })).toBeDefined() // theirs
      expect(await ui.find({ type: 'Text', text: /3 todo/ })).toBeDefined()
      expect(await ui.find({ key: 'band-below' })).toBeDefined()
      await ui.unmount()
    }
  })

  test('hidden, the band hands the whole slot to the other mod', async ($, on) => {
    world(on, RUN_WORLD)
    on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Text', children: ['other band'] }) as never)
    await $.command.run({ command: 'cockpit', args: '' } as never)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'hide' })
    await ui.unmount()
    const after = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await after.find({ type: 'Text', text: /^other band$/ })).toBeDefined()
    expect(await after.find({ type: 'Text', text: /^bow-fix$/ })).toBeUndefined()
    await after.unmount()
  })

  test('/cockpit brings a hidden bar back; /cockpit hide hides it again', async ($, on) => {
    world(on, RUN_WORLD)
    on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Text', children: ['other band'] }) as never)
    await $.command.run({ command: 'cockpit', args: '' } as never)
    const first = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await first.press({ key: 'hide' })
    await first.unmount()
    const hidden = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await hidden.find({ type: 'Text', text: /^bow-fix$/ })).toBeUndefined()
    await hidden.unmount()
    const shown = await $.command.run({ command: 'cockpit', args: 'show' } as never)
    expect(String((shown as { text?: string }).text)).toContain('Cockpit bar shown.')
    const back = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await back.find({ type: 'Text', text: /^bow-fix$/ })).toBeDefined()
    await back.unmount()
    const hid = await $.command.run({ command: 'cockpit', args: 'hide' } as never)
    expect(String((hid as { text?: string }).text)).toContain('/cockpit show')
    const gone = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await gone.find({ type: 'Text', text: /^bow-fix$/ })).toBeUndefined()
    await gone.unmount()
  })

  test('no other band: nothing is added under ours', async ($, on) => {
    world(on, RUN_WORLD)
    await $.command.run({ command: 'cockpit', args: '' } as never)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /^bow-fix$/ })).toBeDefined()
    expect(await ui.find({ key: 'band-below' })).toBeUndefined()
    await ui.unmount()
  })

  test('no run folder: "no run", no resume button; a down editor shows in error', async ($, on) => {
    world(on, { procs: 'UnrealEditor.exe|5|x', mcpJson: MCP_HTTP, isMcpUp: false })
    await $.command.run({ command: 'cockpit', args: '' } as never)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ key: 'resume' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^no run$/ })).toBeDefined()
    expect(await ui.find({ key: 'dash' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /:3091 down/ })).toBeDefined()
    await ui.unmount()
  })
})
