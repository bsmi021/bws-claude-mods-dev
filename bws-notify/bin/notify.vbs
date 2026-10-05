' Starts toast.ps1 with no window. Argument 0: base64 of the toast JSON.
Set sh = CreateObject("WScript.Shell")
dir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
sh.Run "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File """ & dir & "toast.ps1"" " & WScript.Arguments(0), 0, False
