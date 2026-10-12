import os
import re
import sys

added_file = sys.argv[1]
added = open(added_file, encoding='utf-8', errors='replace').read().lower().splitlines()
names = [n.lower() for n in os.listdir('C:/Projects') if len(n) >= 5 and n.lower() != 'bws.mods.claude-code']
BS = chr(92)
print('added lines', len(added), '| project folder names checked', len(names))
folder_hits = [(n, l[:100]) for n in names for l in added if n in l]
print('folder-name hits:', len(folder_hits))
for h in folder_hits[:10]:
    print('  ', h)
pats = {
    'handle/email': r'bsmi|gmail|@[a-z0-9-]+[.](com|net|org)',
    'home/temp path': r'c:[/' + BS + BS + r']users|appdata|/home/|[/' + BS + BS + r']temp[/' + BS + BS + r']',
    'uuid': r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
    'serials/secrets': r'serial|password|secret|api[_-]?key|token',
    'game/project words': r'[^a-z]tms[^a-z]|heim|monastery|sas-ai|bws[.]game|bws[.]tools|c:/projects|pit-maneuver',
    'owner name': r'brian',
}
total = 0
for label, p in pats.items():
    rx = re.compile(p)
    for l in added:
        if rx.search(l):
            total += 1
            print('HIT', label, '|', l[:150])
print('identifier hits:', total)
