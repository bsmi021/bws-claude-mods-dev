# Opens a new Windows Terminal window that runs launch-session.ps1 (wt splits a command line on ';',
# so it is launched from this file with an argument list rather than from a shell string).
param([string]$Title, [string]$Role, [string]$PromptFile, [string]$Dir)
$launcher = Join-Path $PSScriptRoot 'launch-session.ps1'
$wtArgs = @('-w', 'new', '--size', '190,46', 'new-tab', '--title', $Title, '--suppressApplicationTitle', '-d', $Dir,
  'pwsh', '-NoExit', '-NoProfile', '-File', $launcher, '-Role', $Role, '-PromptFile', $PromptFile)
Start-Process wt.exe -ArgumentList $wtArgs
