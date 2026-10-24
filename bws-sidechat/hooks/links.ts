import { toBase64 } from './kit/raster'

// Links and pictures in a side chat message: the URLs and file paths it names get chips that open them in the browser,
// and the PNGs it names are shown under it. Pure: no `$`.

// A path or URL a message names, as written, and what it points at.
export type Ref = { written: string; target: string; isImage: boolean }

const URL_RE = /\bhttps?:\/\/[^\s<>()[\]`'"]+[^\s<>()[\]`'".,;:!?]/g
// An absolute Windows path (C:\x or C:/x), or a relative one with a folder and an extension (docs/a.md, ./x.png).
const PATH_RE = /(?:\b[A-Za-z]:[\\/]|(?:\.{1,2}[\\/])?(?=[\w.-]+[\\/]))[\w .\-\\/@+~]*?[\w-]+\.[A-Za-z0-9]{1,8}\b/g
const IMAGE_MD_RE = /!\[([^\]]*)\]\(([^)\s]+)\)/g

export const isImagePath = (p: string) => /\.png$/i.test(p)

// `C:\a\b c.md` → `file:///C:/a/b%20c.md`; a relative path is taken from `cwd`.
export function absPath(p: string, cwd: string): string {
  const slash = p.replace(/\\/g, '/')
  if (/^[A-Za-z]:\//.test(slash) || slash.startsWith('/')) return slash
  const base = cwd.replace(/\\/g, '/').replace(/\/+$/, '')
  const parts = `${base}/${slash}`.split('/')
  const out: string[] = []
  for (const part of parts) {
    if (part === '.' || (part === '' && out.length > 0)) continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return out.join('/')
}

export function fileUrl(abs: string): string {
  const path = abs.replace(/\\/g, '/')
  const encoded = path
    .split('/')
    .map((seg, i) => (i === 0 && /^[A-Za-z]:$/.test(seg) ? seg : encodeURIComponent(seg)))
    .join('/')
  return `file:///${encoded.replace(/^\/+/, '')}`
}

// Each part of the text outside code fences, with whether it is inside one.
function unfenced(text: string): { text: string; isCode: boolean }[] {
  const out: { text: string; isCode: boolean }[] = []
  const re = /^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm
  let last = 0
  for (const m of text.matchAll(re)) {
    out.push({ text: text.slice(last, m.index), isCode: false }, { text: m[0], isCode: true })
    last = (m.index ?? 0) + m[0].length
  }
  out.push({ text: text.slice(last), isCode: false })
  return out
}

// Every URL and path the text names outside code fences, once each, the images included (`![alt](x.png)`).
export function refsOf(text: string, cwd: string): Ref[] {
  const seen = new Map<string, Ref>()
  const add = (written: string, isUrl: boolean) => {
    const w = written.trim()
    if (w === '' || seen.has(w)) return
    const target = isUrl ? w : absPath(w, cwd)
    seen.set(w, { written: w, target, isImage: isImagePath(w) })
  }
  for (const part of unfenced(text)) {
    if (part.isCode) continue
    for (const m of part.text.matchAll(IMAGE_MD_RE)) add(m[2] as string, /^https?:/i.test(m[2] as string))
    const noUrls = part.text.replace(URL_RE, u => {
      add(u, true)
      return ' '.repeat(u.length)
    })
    for (const m of noUrls.matchAll(PATH_RE)) add(m[0], false)
  }
  return [...seen.values()]
}

// The script that opens a URL (SC_URL) in the default web browser on Windows, a file:/// one included, rather than in
// the app a file's extension belongs to. The browser comes from the https handler the person chose.
export const OPEN_SCRIPT_WINDOWS = [
  "$u = $env:SC_URL",
  "$exe = $null",
  "try {",
  "  $p = (Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice' -ErrorAction Stop).ProgId",
  "  $c = (Get-ItemProperty \"Registry::HKEY_CLASSES_ROOT\\$p\\shell\\open\\command\" -ErrorAction Stop).'(default)'",
  "  if ($c -match '^\"([^\"]+)\"') { $exe = $Matches[1] } elseif ($c -match '^(\\S+)') { $exe = $Matches[1] }",
  "} catch {}",
  "if ($exe -and (Test-Path $exe)) { Start-Process -FilePath $exe -ArgumentList ('\"' + $u + '\"') } else { Start-Process $u }",
].join('\n')

// PowerShell's -EncodedCommand: the script as UTF-16LE, base64, so no quoting of the command line can change it.
export function encodedCommand(script: string): string {
  const bytes = new Uint8Array(script.length * 2)
  for (let i = 0; i < script.length; i++) {
    const c = script.charCodeAt(i)
    bytes[2 * i] = c & 255
    bytes[2 * i + 1] = c >> 8
  }
  return toBase64(bytes)
}

// The command that opens `url` in the browser on this OS (on Windows the URL rides in SC_URL); null for a URL it will
// not hand on.
export function openArgv(url: string, isWindows: boolean, isMac: boolean): string[] | null {
  if (!/^(https?|file):\/\/\S+$/i.test(url) || url.length > 2048) return null
  if (isWindows) return ['powershell', '-NoProfile', '-NonInteractive', '-EncodedCommand', encodedCommand(OPEN_SCRIPT_WINDOWS)]
  return isMac ? ['open', url] : ['xdg-open', url]
}
