# Runs one interactive Claude Code session for the bws-board UI check, inside a Windows Terminal
# window opened by open-session.ps1. The nested-session variables are cleared so the child writes
# its own transcript; NO_COLOR is cleared so the terminal shows colour.
param([string]$Role, [string]$PromptFile)
foreach ($v in 'CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_CHILD_SESSION', 'NO_COLOR') {
  Remove-Item "Env:$v" -ErrorAction SilentlyContinue
}
$env:BWS_AGENT_ROLE = $Role
$prompt = (Get-Content -Raw $PromptFile).Trim()
$run = 'C:/Projects/bws.mods.claude-code/runs/2026-10-10-agent-blackboard'
& 'C:\Users\bsmi0\.local\bin\claude.exe' $prompt `
  --plugin-dir 'C:/Projects/bws.mods.claude-code/bws-board' `
  --settings "$run/live-settings.json" `
  --model haiku `
  --permission-mode acceptEdits `
  --allowedTools 'mcp__bws-board__board_status,mcp__bws-board__board_ask,mcp__bws-board__board_take,mcp__bws-board__board_done,mcp__bws-board__board_decline,mcp__bws-board__board_send,Bash(echo:*)'
