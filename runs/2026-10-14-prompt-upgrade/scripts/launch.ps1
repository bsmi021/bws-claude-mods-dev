param([string]$Title, [int]$Cols, [int]$Rows)
& wt.exe -w new --size "$Cols,$Rows" new-tab --title $Title --suppressApplicationTitle pwsh -NoExit -File C:/Projects/bws.mods.claude-code/runs/2026-10-14-prompt-upgrade/scripts/inner.ps1
