import { test, expect, describe } from 'claude-code/testing'
import {
  base64,
  encodings,
  formatEnv,
  holdsSecret,
  injectCommand,
  nameError,
  parseEnv,
  placeholders,
  projectSlug,
  removeSecret,
  replacePlaceholders,
  scrub,
  secretsDir,
  secretsFile,
  setSecret,
  shellQuote,
  valueError,
} from '../hooks/secrets'

describe('FR-SB-01: the spike mechanism, a rewrite the shell reads the value through', () => {
  test('the placeholder names of a command, each once, in order', () => {
    expect(placeholders('curl -H "x: {{secret:TOKEN}}" {{secret:URL}}/{{secret:TOKEN}}')).toEqual(['TOKEN', 'URL'])
    expect(placeholders('echo {{secret:lower}} {{ secret:SPACED }} {secret:ONE}')).toEqual(['lower'])
    expect(placeholders('ls -la')).toEqual([])
  })

  test('a placeholder becomes an expansion that works where it stands', () => {
    expect(replacePlaceholders('echo "B=[{{secret:API_KEY}}]"')).toBe('echo "B=[${API_KEY}]"')
    expect(replacePlaceholders('curl -u me:{{secret:PW}} x')).toBe('curl -u me:"${PW}" x')
    expect(replacePlaceholders("curl -H 'Authorization: Bearer {{secret:T}}' x")).toBe(
      `curl -H 'Authorization: Bearer '"\${T}"'' x`,
    )
    // followed by a letter, it stays one name
    expect(replacePlaceholders('echo {{secret:A}}_suffix')).toBe('echo "${A}"_suffix')
    // an escaped quote does not open a quote
    expect(replacePlaceholders('echo \\" {{secret:A}}')).toBe('echo \\" "${A}"')
    expect(replacePlaceholders('echo "a \\" {{secret:A}}"')).toBe('echo "a \\" ${A}"')
    expect(replacePlaceholders('ls -la')).toBe('ls -la')
  })

  test('the injected command reads each value from the file in the shell; the value is never in its text', () => {
    const file = 'C:\\Users\\me\\.claude\\bws-secrets\\C--Projects-demo.env'
    const cmd = injectCommand('curl -H "Authorization: Bearer {{secret:TOKEN}}" https://api.example.com', ['TOKEN'], file)
    expect(cmd).toBe(
      `export TOKEN="$(sed -n 's/^TOKEN=//p' 'C:/Users/me/.claude/bws-secrets/C--Projects-demo.env' | head -n 1 | tr -d '\\r')"; ` +
        'curl -H "Authorization: Bearer ${TOKEN}" https://api.example.com',
    )
    const two = injectCommand('echo {{secret:A_1}} {{secret:B_2}}', ['A_1', 'B_2'], '/home/me/s.env')
    expect(two.startsWith(`export A_1="$(sed -n 's/^A_1=//p' '/home/me/s.env'`)).toBe(true)
    expect(two).toContain(`export B_2="$(sed -n 's/^B_2=//p' '/home/me/s.env'`)
    expect(two.endsWith('echo "${A_1}" "${B_2}"')).toBe(true)
  })

  test('a path with a quote is quoted for the shell', () => {
    expect(shellQuote("/home/o'neil/s.env")).toBe(`'/home/o'\\''neil/s.env'`)
  })

  test('the scrub replaces the value and its encodings with the placeholder', () => {
    const secrets = [{ name: 'SPIKE_B', value: 'spkBBB-4402' }]
    expect(scrub('B=[spkBBB-4402]', secrets)).toBe('B=[{{secret:SPIKE_B}}]')
    // the spike's base64 form
    expect(scrub('c3BrQkJCLTQ0MDI=\n', secrets)).toBe('{{secret:SPIKE_B}}\n')
    // echo adds a newline before base64
    expect(scrub(base64([...'spkBBB-4402\n'].map(c => c.charCodeAt(0))), secrets)).toBe('{{secret:SPIKE_B}}')
    expect(scrub('id=spkBBB-4402&x=1', secrets)).toBe('id={{secret:SPIKE_B}}&x=1')
    expect(scrub('73706b4242422d34343032 / 73706B4242422D34343032', secrets)).toBe(
      '{{secret:SPIKE_B}} / {{secret:SPIKE_B}}',
    )
    expect(scrub('nothing here', secrets)).toBe('nothing here')
    expect(holdsSecret('x spkBBB-4402', secrets)).toBe(true)
    expect(holdsSecret('x', secrets)).toBe(false)
  })

  test('encodings: url-safe, percent and JSON forms; nothing shorter than the minimum', () => {
    const v = 'a/b+c?d"é'
    const forms = encodings(v)
    expect(forms).toContain(v)
    expect(forms).toContain(encodeURIComponent(v))
    expect(forms).toContain('a/b+c?d\\"é')
    expect(forms.some(f => f.includes('-') || f.includes('_'))).toBe(true)
    expect(base64([0xff, 0xfe, 0xfd])).toBe('//79')
    expect(encodings('abcd').every(f => f.length >= 4)).toBe(true)
  })

  test('a value inside another is replaced whole by the longer one', () => {
    const secrets = [
      { name: 'SHORT', value: 'abcd1234' },
      { name: 'LONG', value: 'xxabcd1234yy' },
    ]
    expect(scrub('xxabcd1234yy and abcd1234', secrets)).toBe('{{secret:LONG}} and {{secret:SHORT}}')
  })
})

describe('FR-SB-01: names, values and the secrets file', () => {
  test('names: upper case, digits and _, no shell variables', () => {
    expect(nameError('API_KEY')).toBe(null)
    expect(nameError('A1')).toBe(null)
    expect(nameError('api_key')).toContain('not a usable name')
    expect(nameError('1KEY')).toContain('not a usable name')
    expect(nameError('A-B')).toContain('not a usable name')
    expect(nameError('PATH')).toContain('shell or system variable')
    expect(nameError('HOME')).toContain('shell or system variable')
  })

  test('values: one line, at least 4 characters', () => {
    expect(valueError('s3cret')).toBe(null)
    expect(valueError('')).toBe('Nothing was typed.')
    expect(valueError('abc')).toContain('at least 4')
    expect(valueError('a\nb c d')).toContain('one line')
    expect(valueError('x'.repeat(9000))).toContain('at most')
  })

  test('the folder: default under ~/.claude, the option, ~ expanded, forward slashes', () => {
    expect(secretsDir('', 'C:\\Users\\me')).toBe('C:/Users/me/.claude/bws-secrets')
    expect(secretsDir('', '/home/me/')).toBe('/home/me/.claude/bws-secrets')
    expect(secretsDir('~/vault/', '/home/me')).toBe('/home/me/vault')
    expect(secretsDir('D:\\keys\\', '/home/me')).toBe('D:/keys')
  })

  test('the file: one per project, named like Claude Code names project folders', () => {
    expect(projectSlug('C:\\Projects\\bws.mods')).toBe('C--Projects-bws-mods')
    expect(secretsFile('/home/me/.claude/bws-secrets', '/home/me/src/app')).toBe(
      '/home/me/.claude/bws-secrets/-home-me-src-app.env',
    )
  })

  test('dotenv lines: read, set in place, removed, written with LF', () => {
    const list = parseEnv('# saved by bws-secrets\r\nA=1=2\r\n\r\nbad=x\nB=two words\nA=again\n')
    expect(list).toEqual([
      { name: 'A', value: '1=2' },
      { name: 'B', value: 'two words' },
    ])
    const set = setSecret(list, 'A', 'new1')
    expect(set.map(s => s.name)).toEqual(['A', 'B'])
    expect(formatEnv(setSecret(set, 'C', 'cccc'))).toBe('A=new1\nB=two words\nC=cccc\n')
    expect(removeSecret(set, 'A')).toEqual([{ name: 'B', value: 'two words' }])
  })
})
