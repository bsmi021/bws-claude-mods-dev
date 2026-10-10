"""Re-run the Python reference (runs/2026-10-02-shell-lint-mod/lint.py, new long-command metric)
over every entry of bws-shell-lint/tests/corpus-fixture.ts and rewrite each entry's rule and detail.
Commands, ids and the header stay as they are. Prints every entry whose verdict changed."""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(REPO, 'runs', '2026-10-02-shell-lint-mod'))
import lint as ref  # noqa: E402

path = os.path.join(REPO, 'bws-shell-lint', 'tests', 'corpus-fixture.ts')
text = open(path, encoding='utf-8').read()
marker = 'export const FIXTURE: FixtureEntry[] = '
head, body = text.split(marker, 1)
entries = json.loads(body)
changed = []
for e in entries:
    f = ref.lint(e['command'])
    rule = f['rule'] if f else None
    detail = str(f['detail']) if f else None
    if (rule, detail) != (e['rule'], e['detail']):
        changed.append((e['id'], e['rule'], e['detail'], rule, detail))
    e['rule'], e['detail'] = rule, detail
out = head + marker + '[\n' + ',\n'.join(json.dumps(e, indent=0, ensure_ascii=False) for e in entries) + '\n]\n'
open(path, 'w', encoding='utf-8', newline='\n').write(out)
for c in changed:
    print('changed', c)
print(len(entries), 'entries,', len(changed), 'changed')
