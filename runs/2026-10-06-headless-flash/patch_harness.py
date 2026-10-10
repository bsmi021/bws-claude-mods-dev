"""Add a CREATE_NO_WINDOW shim to harness.py files. Idempotent. Usage: patch_harness.py <file>..."""
import sys, re
MARK = "# bws-nowindow-shim"
SHIM = '''
{m}: on Windows every child starts with CREATE_NO_WINDOW. A harness driver runs detached (no
# console), and with Windows Terminal as the default terminal each console exe started without a console
# opens a new terminal window. The flag is ignored with DETACHED_PROCESS / CREATE_NEW_CONSOLE, so those calls are left as they are.
if os.name == "nt":
    _PopenReal = subprocess.Popen

    class _PopenNoWindow(_PopenReal):
        def __init__(self, *args, **kwargs):
            flags = kwargs.get("creationflags", 0)
            if not flags & 0x00000018:  # DETACHED_PROCESS | CREATE_NEW_CONSOLE
                kwargs["creationflags"] = flags | 0x08000000  # CREATE_NO_WINDOW
            super().__init__(*args, **kwargs)

    subprocess.Popen = _PopenNoWindow
'''.format(m=MARK)
for path in sys.argv[1:]:
    raw = open(path, "rb").read()
    crlf = b"\r\n" in raw
    text = raw.decode("utf-8").replace("\r\n", "\n")
    if MARK in text:
        print("already", path); continue
    # after the last top-level import in the leading import block
    lines = text.split("\n")
    last = max(i for i, l in enumerate(lines[:120]) if re.match(r"(import|from) \w", l))
    assert "import subprocess" in text[:text.index(lines[last]) + len(lines[last])], path
    assert any(l.startswith("import os") for l in lines[:last + 1]), path
    # keep a multi-line import intact: the last import must be a one-liner
    assert "(" not in lines[last], path
    lines[last + 1:last + 1] = SHIM.rstrip("\n").split("\n")
    out = "\n".join(lines)
    open(path, "wb").write((out.replace("\n", "\r\n") if crlf else out).encode("utf-8"))
    print("patched", path, "crlf" if crlf else "lf", "after line", last + 1)
