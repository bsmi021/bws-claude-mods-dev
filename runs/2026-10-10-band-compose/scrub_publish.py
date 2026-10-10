"""Neutral wording for test strings and comments before publishing (private project phrases, the owner's name)."""
import os

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
Q = chr(92) + "'"  # \' as it appears inside the TS single-quoted strings


def sub(rel, pairs):
    path = os.path.join(REPO, rel)
    s = open(path, encoding='utf-8').read()
    for a, b in pairs:
        assert a in s, (rel, a[:60])
        s = s.replace(a, b)
    open(path, 'w', encoding='utf-8', newline='\n').write(s)


sub('bws-cockpit/tests/finish.test.ts', [
    ("It needs the tablet connected and unlocked. Tell me when it" + Q + "s plugged in.')).toBe(true)",
     "It needs the device connected and unlocked. Tell me when it" + Q + "s plugged in.')).toBe(true)"),
    ('tell me "tablet ready" and I', 'tell me "device ready" and I'),
    ('When you say "tablet ready", I', 'When you say "device ready", I'),
    ('Once the notebook is on a tablet, say "go"', 'Once the test file is on the device, say "go"'),
    ("'Next: the faster pose model. Say if you want a different order.'", "'Next: the faster parser. Say if you want a different order.'"),
    ("isParked('Brian: tape floor marks, record the 34 takes', 'Brian')", "isParked('Dana: record the reference clips', 'Dana')"),
    ("isParked('Brian: tape floor marks', 'the user')", "isParked('Dana: record the reference clips', 'the user')"),
    ("isParked('Quick pass two: hand landmarker wrists', 'Brian')", "isParked('Second pass: tidy the parser', 'Dana')"),
    ("actionable(['Brian: record takes', 'faster pose model'], 'Brian')).toEqual(['faster pose model'])",
     "actionable(['Dana: record clips', 'faster parser'], 'Dana')).toEqual(['faster parser'])"),
    ("test('the 10-06 shapes: a supervisor reply", "test('real reply shapes: a supervisor reply"),
    ("Next is F5. It needs the tablet connected and unlocked.", "Next is step 5. It needs the device connected and unlocked."),
    ("The measured comparison waits on your takes.", "The measured comparison waits on your clips."),
])
sub('bws-cockpit/tests/cockpit.test.ts', [("adb shell pidof com.bws.inkwell", "adb shell pidof com.example.app")])
sub('bws-shell-lint/hooks/lint.ts', [
    ("// Replayed over 73,857 real Bash commands (runs/2026-10-10-mods-release): at 7800 it catches 152 of",
     "// Replayed over 73,857 real Bash commands: at 7800 it catches 152 of"),
])
print('ok')
