// What bws-mask hides on screen, as pure functions: find the private spans of a string, draw each as a bar of its own
// length (spaces stay spaces) so a row keeps its length and wrapping, and do the same to every string inside a tool's
// input or result without changing its shape.
//
// Conservative on purpose: a version (2.1.311), a token count (182k), a shell argument ($1), a date or a file path must
// never be hidden. A bar over plain output ruins a recording more than a rare miss.

export type Kind = 'email' | 'name' | 'phone' | 'amount' | 'key' | 'user' | 'term'
export const KINDS: readonly Kind[] = ['email', 'name', 'phone', 'amount', 'key', 'user', 'term']
export type Span = { a: number; b: number; kind: Kind }
export type Rules = { terms: readonly string[] }

export const BAR = '▒'

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,24}(?![A-Za-z0-9-])(?!:[\w~/])/g
// One to three capitalised words right before `<email>`: a git author, a mail header.
const NAME_BEFORE_RE = /(\p{Lu}[\p{L}'’.-]*(?:[ \t]+\p{Lu}[\p{L}'’.-]*){0,2})[ \t]*<[ \t]*$/u
const NOREPLY_RE = /^(?:[\w.+-]*\+)?no-?reply@|@users\.noreply\./i
const NOT_NAMES =new Set(['From', 'To', 'Cc', 'Bcc', 'Author', 'Co-Authored-By', 'Signed-off-by', 'Reply-To'])

// Links: phone and money hits inside one are ids or query strings, not private.
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'`)\]]+/gi

// Keys and tokens: well-known prefixes, a JWT, a bearer header, and the value after a secret-looking key.
const KEY_RES: RegExp[] = [
  /\b(?:sk-ant-[A-Za-z0-9_-]{16,}|sk-(?:proj-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_\w{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|xox[abposr]-[A-Za-z0-9-]{10,}|glpat-[A-Za-z0-9_-]{20,}|npm_[A-Za-z0-9]{36})\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
]
// The value alone is hidden: `Bearer <v>`, `api_key=<v>`, `"password": "<v>"`.
const KEY_VALUE_RES: RegExp[] = [
  /\bBearer[ \t]+([A-Za-z0-9._~+/=-]{16,})/g,
  /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|secret|client[_-]?secret|password|passwd)["']?[ \t]*[:=][ \t]*["']?([^\s"',;}{]{8,})/gi,
]

// The account name in a home path: C:\Users\<name>, /Users/<name>, /home/<name>. Placeholders stay.
const USER_RE = /(?:\b[A-Za-z]:(?:\\\\|\\|\/)+Users|(?<![\w.])\/(?:[A-Za-z]\/)?(?:Users|home))(?:\\\\|\\|\/)+(\w[^\\/\s"'<>`:*?|()[\]]*)/gi
const NOT_USERS = /^(?:Public|Default|All Users|Shared|you|user|username|USER|me|runner|<.*|\{.*|%.*|\$.*)$/i

// Money: a currency mark or code with a number. `$1`..`$9` alone is a shell or regex argument and stays.
const NUM = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?`
const SCALE = String.raw`(?:[ \t]?(?:k|K|m|M|bn|BN|b|B)\b|[ \t](?:thousand|million|billion)\b)`
const CODES = 'USD|GBP|EUR|CAD|AUD|JPY|CHF|INR'
const MONEY_RES: RegExp[] = [
  new RegExp(String.raw`(?<![\w$\\])(?:US|C|A)?[$£€¥₹][ \t]?(?:${NUM})${SCALE}?(?![\w%])`, 'g'),
  new RegExp(String.raw`(?<![\w.])(?:${CODES})[ \t]?(?:${NUM})${SCALE}?(?![\w%])`, 'g'),
  new RegExp(String.raw`(?<![\w.,])(?:${NUM})${SCALE}?[ \t]?(?:${CODES}|dollars?|euros?|pounds)(?!\w)`, 'g'),
]
const SHELL_ARG_RE = /^[$][0-9]$/

// Phones need a boundary that is no letter, digit, slash, dot, hyphen, hash, equals or @ on either side.
const L = String.raw`(?<![\w/\\.#=@+:-])`
const R = String.raw`(?![\w/\\@%:-]|\.\d|,\d)`
const PHONE_RES: RegExp[] = [
  // +44 7700 900123, +1 (415) 555-0132, +4915112345678
  new RegExp(String.raw`${L}\+\d{1,3}(?:[ .-]?\(?\d{1,5}\)?){1,5}${R}`, 'g'),
  // (415) 555-0132, 415-555-0132, 415.555.0132, 1-415-555-0132
  new RegExp(String.raw`${L}(?:1[ .-])?(?:\(\d{3}\)[ ]?|\d{3}[.-])\d{3}[.-]\d{4}${R}`, 'g'),
]
const DATE_LIKE_RE = /^\(?(?:19|20)\d{2}[ .-]\d{1,2}[ .-]\d{1,2}|^\(?\d{1,2}[ .-]\d{1,2}[ .-](?:19|20)\d{2}/

const QUICK_RE = /[@\d:/\\]/
const NOT_SPACE_RE = /\S/gu

const digitCount = (s: string) => s.replace(/\D/g, '').length

function isPhone(hit: string): boolean {
  const n = digitCount(hit)
  if (n < 10 || n > 15) return false
  return !DATE_LIKE_RE.test(hit.replace(/^\+/, ''))
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Terms compile once per list; a term matches whole, any case, not inside a longer word.
let termKey = ''
let termRe: RegExp | null = null
function termRegex(terms: readonly string[]): RegExp | null {
  const key = terms.join('\u0000')
  if (key === termKey) return termRe
  termKey = key
  const parts = terms.map(t => t.trim()).filter(t => t.length >= 2).sort((a, b) => b.length - a.length).map(escapeRe)
  termRe = parts.length ? new RegExp(String.raw`(?<![\p{L}\p{N}_])(?:${parts.join('|')})(?![\p{L}\p{N}_])`, 'giu') : null
  return termRe
}

/** The terms in a comma- or newline-separated option, blanks dropped. */
export function parseTerms(raw: unknown): string[] {
  if (typeof raw !== 'string') return []
  return [...new Set(raw.split(/[,\n;]/).map(t => t.trim()).filter(t => t.length >= 2))]
}

/** The account name in a home folder path (the plugin's own root, say), or '' when there is none. */
export function userOfPath(path: string): string {
  USER_RE.lastIndex = 0
  const m = USER_RE.exec(path)
  const name = m?.[1] ?? ''
  return name && !NOT_USERS.test(name) ? name : ''
}

function overlaps(used: Uint8Array, a: number, b: number): boolean {
  for (let i = a; i < b; i++) if (used[i]) return true
  return false
}

/** Every private span in `text`, sorted, overlaps merged (the earlier kind wins). */
export function findSpans(text: string, rules: Rules): Span[] {
  if (!text || !QUICK_RE.test(text) && rules.terms.length === 0) return []
  const spans: Span[] = []
  const used = new Uint8Array(text.length)
  const add = (a: number, b: number, kind: Kind) => {
    if (b <= a || overlaps(used, a, b)) return
    spans.push({ a, b, kind })
    used.fill(1, a, b)
  }
  const each = (re: RegExp, f: (m: RegExpMatchArray, at: number) => void) => {
    re.lastIndex = 0
    for (const m of text.matchAll(re)) f(m, m.index ?? 0)
  }
  for (const re of KEY_RES) each(re, (m, at) => add(at, at + m[0].length, 'key'))
  for (const re of KEY_VALUE_RES)
    each(re, (m, at) => {
      const v = m[1] ?? ''
      const end = at + m[0].length
      // A real secret mixes letters and digits; `process.env.TOKEN` or `string` is code.
      if (/\d/.test(v) && /[A-Za-z]/.test(v)) add(end - v.length, end, 'key')
    })
  if (text.includes('@'))
    each(EMAIL_RE, (m, at) => {
      // A noreply address (a commit trailer's) is no person's.
      if (NOREPLY_RE.test(m[0])) return
      add(at, at + m[0].length, 'email')
      const before = NAME_BEFORE_RE.exec(text.slice(Math.max(0, at - 60), at))
      const name = before?.[1] ?? ''
      if (name && !NOT_NAMES.has(name.split(/[ \t]/)[0] ?? '')) {
        const end = at - (before?.[0].length ?? 0) + name.length
        add(end - name.length, end, 'name')
      }
    })
  each(USER_RE, (m, at) => {
    const name = m[1] ?? ''
    if (!name || NOT_USERS.test(name)) return
    const end = at + m[0].length
    add(end - name.length, end, 'user')
  })
  const terms = termRegex(rules.terms)
  if (terms) each(terms, (m, at) => add(at, at + m[0].length, 'term'))
  if (/\d/.test(text)) {
    const inLink = new Uint8Array(text.length)
    each(URL_RE, (m, at) => inLink.fill(1, at, at + m[0].length))
    for (const re of MONEY_RES)
      each(re, (m, at) => {
        if (!SHELL_ARG_RE.test(m[0]) && !overlaps(inLink, at, at + m[0].length)) add(at, at + m[0].length, 'amount')
      })
    for (const re of PHONE_RES)
      each(re, (m, at) => {
        if (isPhone(m[0]) && !overlaps(inLink, at, at + m[0].length)) add(at, at + m[0].length, 'phone')
      })
  }
  return spans.sort((x, y) => x.a - y.a)
}

/** A bar as long as `hit`: every character but a space becomes the bar. */
export const bar = (hit: string) => hit.replace(NOT_SPACE_RE, BAR)

export type Hit = { kind: Kind; value: string }
export type Masked = { text: string; hits: Hit[] }

/** `text` with every private span drawn as a bar, and what was hidden. The same string when nothing was. */
export function redact(text: string, rules: Rules): Masked {
  const spans = findSpans(text, rules)
  if (spans.length === 0) return { text, hits: [] }
  let out = ''
  let at = 0
  const hits: Hit[] = []
  for (const s of spans) {
    const value = text.slice(s.a, s.b)
    out += text.slice(at, s.a) + bar(value)
    hits.push({ kind: s.kind, value })
    at = s.b
  }
  return { text: out + text.slice(at), hits }
}

// Rows draw again on every scroll; a long text is masked once and kept.
const cache = new Map<string, Masked>()
const CACHE_MAX = 300

/** `redact`, cached for long strings (rules are part of the key). */
export function mask(text: string, rules: Rules): Masked {
  if (typeof text !== 'string' || !text) return { text, hits: [] }
  if (text.length < 200) return redact(text, rules)
  termRegex(rules.terms)
  const key = `${termKey}\u0001${text}`
  const got = cache.get(key)
  if (got) return got
  const out = redact(text, rules)
  if (cache.size >= CACHE_MAX) {
    const first = cache.keys().next().value
    if (first !== undefined) cache.delete(first)
  }
  cache.set(key, out)
  return out
}

// Ids reach the engine as they were.
const KEEP_KEYS = new Set(['tool_use_id', 'id', 'taskId', 'agentId', 'type'])

/**
 * Masks every string inside plain data (a tool's input or result), keeping its shape and keys so a result still fits
 * its tool's schema. The same value back when nothing changed; hits are pushed onto `hits`.
 */
export function maskDeep<T>(value: T, rules: Rules, hits: Hit[] = [], depth = 0): T {
  if (typeof value === 'string') {
    const m = mask(value, rules)
    hits.push(...m.hits)
    return m.text as T
  }
  if (value === null || typeof value !== 'object' || depth > 30) return value
  if (Array.isArray(value)) {
    let isChanged = false
    const out = value.map(v => {
      const m = maskDeep(v, rules, hits, depth + 1)
      if (m !== v) isChanged = true
      return m
    })
    return (isChanged ? out : value) as T
  }
  const proto = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) return value
  let isChanged = false
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const m = KEEP_KEYS.has(k) ? v : maskDeep(v, rules, hits, depth + 1)
    if (m !== v) isChanged = true
    out[k] = m
  }
  return (isChanged ? out : value) as T
}
