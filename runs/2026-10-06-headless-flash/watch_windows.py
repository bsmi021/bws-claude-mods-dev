"""Logs every NEW visible console-class window with its client process (parent of the owning conhost/OpenConsole)."""
import ctypes, ctypes.wintypes as w, sys, time, os
u, k = ctypes.windll.user32, ctypes.windll.kernel32
out, secs = sys.argv[1], float(sys.argv[2])

class PE(ctypes.Structure):
    _fields_ = [("dwSize", w.DWORD), ("cntUsage", w.DWORD), ("th32ProcessID", w.DWORD), ("th32DefaultHeapID", ctypes.c_void_p),
                ("th32ModuleID", w.DWORD), ("cntThreads", w.DWORD), ("th32ParentProcessID", w.DWORD), ("pcPriClassBase", w.LONG),
                ("dwFlags", w.DWORD), ("szExeFile", ctypes.c_wchar * 260)]
k.CreateToolhelp32Snapshot.restype = w.HANDLE
def procs():
    s = k.CreateToolhelp32Snapshot(2, 0); pe = PE(); pe.dwSize = ctypes.sizeof(PE); d = {}
    ok = k.Process32FirstW(s, ctypes.byref(pe))
    while ok:
        d[pe.th32ProcessID] = (pe.th32ParentProcessID, pe.szExeFile); ok = k.Process32NextW(s, ctypes.byref(pe))
    k.CloseHandle(s); return d

CB = ctypes.WINFUNCTYPE(w.BOOL, w.HWND, w.LPARAM)
def windows():
    res = []
    def cb(h, _):
        if u.IsWindowVisible(h):
            buf = ctypes.create_unicode_buffer(256); u.GetClassNameW(h, buf, 256)
            pid = w.DWORD(); u.GetWindowThreadProcessId(h, ctypes.byref(pid))
            res.append((h, buf.value, pid.value))
        return True
    u.EnumWindows(CB(cb), 0); return res

seen = {h for h, _, _ in windows()}
t0 = time.time(); f = open(out, "a")
while time.time() - t0 < secs:
    for h, cls, pid in windows():
        if h in seen: continue
        seen.add(h)
        pr = procs(); ppid, img = pr.get(pid, (0, "?"))
        cpid, cimg = pr.get(ppid, (0, "?"))
        # a console window's owner is conhost/OpenConsole; its parent is the client that got the console
        f.write(f"+{time.time()-t0:5.1f}s hwnd={h} class={cls} owner={img}({pid}) parent={cimg}({ppid})\n"); f.flush()
    time.sleep(0.05)
