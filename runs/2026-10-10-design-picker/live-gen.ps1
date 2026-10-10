Remove-Item Env:CLAUDECODE, Env:CLAUDE_CODE_ENTRYPOINT, Env:CLAUDE_CODE_CHILD_SESSION, Env:NO_COLOR -ErrorAction SilentlyContinue
Set-Location C:/Projects/bws.mods.claude-code/runs/2026-10-10-design-picker
$p = 'I am building a landing page for a small specialty coffee roaster. Before writing anything, ask me which visual design direction I want, with three distinct options. Use AskUserQuestion with NO preview field on any option. Do not write any files.'
claude --debug-file C:/Projects/bws.mods.claude-code/runs/2026-10-10-design-picker/receipts/live-gen4-opus-debug.log $p
