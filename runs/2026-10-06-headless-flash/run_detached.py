import subprocess, sys
# DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP, like harness._spawn_detached
subprocess.Popen([sys.executable, "C:/Projects/bws.mods.claude-code/runs/2026-10-06-headless-flash/launch_test.py", sys.argv[1]],
                 creationflags=0x00000008 | 0x00000200, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
