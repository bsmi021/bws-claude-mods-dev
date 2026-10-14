Remove-Item Env:CLAUDECODE, Env:CLAUDE_CODE_ENTRYPOINT, Env:CLAUDE_CODE_CHILD_SESSION, Env:NO_COLOR -ErrorAction SilentlyContinue
Set-Location C:/Projects/bws.mods.claude-code
& C:/Users/bsmi0/.local/bin/claude.exe --plugin-dir ./bws-better
