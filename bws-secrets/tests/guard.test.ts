import { test, expect, describe } from 'claude-code/testing'
import { bashTouches, dirForms, isInside, reaches, resolvePath, touchesSecrets } from '../hooks/guard'
import { CWD, DIR, FILE, HOME, world } from './world'

const forms = dirForms(DIR, HOME, CWD)
const hits = (command: string) => bashTouches(command, forms)

// Commands of the kinds Claude Code runs every day, some near the folder's name: none may be refused.
const CLEAN = [
  'ls -la',
  'git status --short',
  'git log --oneline -5 -- bws-secrets/',
  'cd bws-secrets && claude plugin test',
  'claude plugin validate ./bws-secrets',
  'cat .env.example',
  'cat ~/.claude/settings.json | head -20',
  'ls ~/.claude/',
  'ls ~/.claude/projects | head',
  'grep -rn "bws-secrets" README.md',
  'rg -n "secretsDir" bws-secrets/hooks',
  'python tools/mods-gate.py --plugin bws-secrets',
  'npm test -- --grep secrets',
  'echo "use {{secret:NAME}} in a command"',
  'cat ~/.claude/bws-secrets-old/notes.txt',
  'ls C:/Users/me/.claude/plugins',
  'git commit -m "M8: bws-secrets folder rules"',
  'curl -s https://api.example.com/v1/items | jq .',
  'find . -name "*.env" -not -path "./node_modules/*"',
  'dotnet build -c Release',
  'pwsh -NoProfile -Command "Get-ChildItem $env:USERPROFILE\\.claude\\plugins"',
  "python - <<'EOF'\nprint('hello')\nEOF",
  'type C:\\Users\\me\\.claude\\CLAUDE.md',
  'cat ~/.claude/projects/C--proj-app/memory/MEMORY.md',
]

// Ways a command names the folder or a file in it: all refused.
const READS = [
  `cat ${FILE}`,
  'cat ~/.claude/bws-secrets/C--proj-app.env',
  'cat "$HOME/.claude/bws-secrets/C--proj-app.env"',
  'cat "${HOME}"/.claude/bws-secrets/*.env',
  'ls ~/.claude/bws-secrets',
  'ls ~/.claude/bws-secrets/',
  'type C:\\Users\\me\\.claude\\bws-secrets\\C--proj-app.env',
  'cat /c/Users/me/.claude/bws-secrets/C--proj-app.env',
  'CAT C:/USERS/ME/.CLAUDE/BWS-SECRETS/X.ENV',
  'grep -r TOKEN ~/.claude/bws-secrets',
  "python - <<'EOF'\nprint(open('C:/Users/me/.claude/bws-secrets/C--proj-app.env').read())\nEOF",
  'powershell -c "gc $env:USERPROFILE\\.claude\\bws-secrets\\C--proj-app.env"',
  'cp ~/.claude/bws-secrets/C--proj-app.env /tmp/x && cat /tmp/x',
]

describe('FR-SB-03: what reaches the secrets folder', () => {
  test('paths: ~ expanded, relative to cwd, .. resolved, Git Bash drive form', () => {
    expect(resolvePath('~/.claude/bws-secrets/x.env', CWD, HOME)).toBe('C:/Users/me/.claude/bws-secrets/x.env')
    expect(resolvePath('src/a.ts', CWD, HOME)).toBe('C:/proj/app/src/a.ts')
    expect(resolvePath('../../Users/me/.claude/bws-secrets', CWD, HOME)).toBe('C:/Users/me/.claude/bws-secrets')
    expect(resolvePath('/c/Users/me', CWD, HOME)).toBe('c:/Users/me')
    expect(isInside('c:\\users\\ME\\.claude\\bws-secrets\\a.env', DIR)).toBe(true)
    expect(isInside('C:/Users/me/.claude/bws-secrets-old/a.env', DIR)).toBe(false)
    expect(reaches('C:/Users/me', DIR)).toBe(true)
    expect(reaches('C:/', DIR)).toBe(true)
    expect(reaches('C:/proj/app', DIR)).toBe(false)
  })

  test('Read, Grep and Glob: inside the folder, or a search that walks into it', () => {
    const t = (e: object) => touchesSecrets({ tool: 'Read', ...e }, DIR, CWD, HOME)
    expect(t({ tool: 'Read', file_path: FILE })).toBe(true)
    expect(t({ tool: 'Read', file_path: '~/.claude/bws-secrets/C--proj-app.env' })).toBe(true)
    expect(t({ tool: 'Read', file_path: 'C:/Users/me/.claude/settings.json' })).toBe(false)
    expect(t({ tool: 'Read', file_path: 'README.md' })).toBe(false)
    expect(t({ tool: 'Grep', pattern: 'TOKEN', path: '~/.claude' })).toBe(true)
    expect(t({ tool: 'Grep', pattern: 'TOKEN', path: DIR })).toBe(true)
    expect(t({ tool: 'Grep', pattern: 'TOKEN' })).toBe(false)
    expect(t({ tool: 'Grep', pattern: 'TOKEN', path: 'src' })).toBe(false)
    expect(t({ tool: 'Glob', pattern: '**/*.env', path: '~' })).toBe(true)
    expect(t({ tool: 'Glob', pattern: 'C:/Users/me/.claude/bws-secrets/*.env' })).toBe(true)
    expect(t({ tool: 'Glob', pattern: '**/*.ts' })).toBe(false)
    expect(t({ tool: 'Edit', file_path: FILE })).toBe(false)
  })

  test('Bash: the folder named in any shell form is refused', () => {
    for (const c of READS) expect([c, hits(c)]).toEqual([c, true])
  })

  test('Bash: false-positive corpus, none refused', () => {
    for (const c of CLEAN) expect([c, hits(c)]).toEqual([c, false])
  })

  test('a custom folder outside home is matched by its own path', () => {
    const f = dirForms('D:/vault/keys', HOME, CWD)
    expect(bashTouches('cat D:\\vault\\keys\\a.env', f)).toBe(true)
    expect(bashTouches('cat /d/vault/keys/a.env', f)).toBe(true)
    expect(bashTouches('cat D:/vault/keys-old/a.env', f)).toBe(false)
  })
})

describe('FR-SB-03: the refusal, as the model reads it', () => {
  test('Read, Grep, Glob and Bash of the folder are refused and told to use the placeholder', async ($, on) => {
    const { seen } = world(on)
    const calls = [
      { tool: 'Read', file_path: FILE },
      { tool: 'Grep', pattern: 'KEY', path: '~/.claude' },
      { tool: 'Glob', pattern: '*.env', path: DIR },
      { tool: 'Bash', command: 'cat ~/.claude/bws-secrets/*.env' },
    ]
    for (const c of calls) {
      const r = (await $.tool.call(c as never)) as { deny?: string }
      expect(r.deny).toContain(`${c.tool} refused: it would read the secrets folder (${DIR})`)
      expect(r.deny).toContain('{{secret:NAME}}')
    }
    expect(seen.reached).toEqual([])
  })

  test('does not intercept other reads and commands', async ($, on) => {
    const { seen } = world(on)
    await $.tool.call({ tool: 'Read', file_path: 'C:/proj/app/README.md' } as never)
    await $.tool.call({ tool: 'Grep', pattern: 'x' } as never)
    await $.tool.call({ tool: 'Glob', pattern: '**/*.ts' } as never)
    await $.tool.call({ tool: 'Bash', command: 'git status' } as never)
    await $.tool.call({ tool: 'Edit', file_path: FILE, old_string: 'a', new_string: 'b' } as never)
    expect(seen.reached.map(r => r.tool)).toEqual(['Read', 'Grep', 'Glob', 'Bash', 'Edit'])
    expect(seen.reached[3]?.command).toBe('git status')
  })
})
