# Hold test for the msg button: a recipient in default permission mode, then a sender in
# bypass mode with the notice probe loaded, which sends it two messages. Clears the variables a
# child session inherits from this one.
param([ValidateSet('recipient', 'sender')] [string]$Role, [string]$To = '')

$clear = "Remove-Item Env:CLAUDECODE, Env:CLAUDE_CODE_ENTRYPOINT, Env:CLAUDE_CODE_CHILD_SESSION, Env:NO_COLOR -ErrorAction SilentlyContinue; Set-Location 'C:\Projects\bws.mods.claude-code'"
$claude = "& 'C:\Users\bsmi0\.local\bin\claude.exe'"
if ($Role -eq 'recipient') {
  $inner = "$clear; $claude -n notice-recipient --permission-mode default"
} else {
  $probe = 'C:\Projects\bws.mods.claude-code\runs\2026-10-02-repo-sessions-pane\notice-probe'
  $send = "/probe-send $To PROBE A: please approve this one | PROBE B: please deny this one"
  $inner = "$clear; $claude -n notice-sender --permission-mode bypassPermissions --plugin-dir '$probe' '$send'"
}
$encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($inner))
Start-Process 'wt.exe' -ArgumentList @('-w', 'new', '--title', "notice-$Role", 'pwsh', '-NoExit', '-EncodedCommand', $encoded)
