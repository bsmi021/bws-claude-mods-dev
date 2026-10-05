param([Parameter(Mandatory)][string]$B64)
try {
  $t = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($B64)) | ConvertFrom-Json
  [void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
  [void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]
  $xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
  $n = $xml.GetElementsByTagName('text')
  $n.Item(0).AppendChild($xml.CreateTextNode($t.title)) | Out-Null
  $n.Item(1).AppendChild($xml.CreateTextNode($t.body)) | Out-Null
  $app = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($app).Show([Windows.UI.Notifications.ToastNotification]::new($xml))
} catch {
  Add-Content -Path (Join-Path $env:TEMP 'bws-notify.err') -Value "$(Get-Date -Format o) $($_.Exception.Message)"
}
