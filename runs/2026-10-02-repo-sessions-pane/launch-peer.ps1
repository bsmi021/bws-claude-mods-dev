# Opens a second interactive Claude Code session in this repo, in a new maximized
# Windows Terminal window, for the Repo Sessions live check. Clears the variables a child
# session would inherit from this one (they make it hang or skip its transcript).
$inner = @'
Remove-Item Env:CLAUDECODE, Env:CLAUDE_CODE_ENTRYPOINT, Env:CLAUDE_CODE_CHILD_SESSION, Env:NO_COLOR -ErrorAction SilentlyContinue
Set-Location 'C:\Projects\bws.mods.claude-code'
& 'C:\Users\bsmi0\.local\bin\claude.exe' -n repo-sessions-check 'reply with just: ok'
'@
$encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($inner))
Start-Process 'wt.exe' -ArgumentList @('-w', 'new', '--maximized', '--title', 'repo-sessions-check', 'pwsh', '-NoExit', '-EncodedCommand', $encoded)
