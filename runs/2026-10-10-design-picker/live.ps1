Remove-Item Env:CLAUDECODE, Env:CLAUDE_CODE_ENTRYPOINT, Env:CLAUDE_CODE_CHILD_SESSION, Env:NO_COLOR -ErrorAction SilentlyContinue
Set-Location C:/Projects/bws.mods.claude-code/runs/2026-10-10-design-picker
$p = 'I am building a landing page for a small specialty coffee roaster. Before writing anything, ask me which visual design direction I want, with three distinct options. Do not write any files.'
claude --debug-file C:/Projects/bws.mods.claude-code/runs/2026-10-10-design-picker/receipts/live-debug.log --plugin-dir C:/Projects/bws.mods.claude-code/bws-design-picker $p
