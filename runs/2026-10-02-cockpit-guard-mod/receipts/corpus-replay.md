# Corpus replay: bws-cockpit guard classifiers

Corpus: every Bash/PowerShell tool_use in ~/.claude/projects (last 30 days) that mentions adb, unity or UnrealEditor: 8277 commands.

| Classifier | First version (substring match) | Command-position parser |
|---|---|---|
| adb needs device | 1015 | 1135 (more found behind $ADB and $(...)) |
| unity pipeline command | 922 | 896 |
| Unity launch rewrite | 33 (Get-CimInstance filters, heredoc bodies, --help, git messages) | 3, all real unity open launches |
| UE GUI launch | 261 (Get-CimInstance, tasklist, $editor= strings) | 72, all real GUI launches |

## Distinct UE launches detected
```
  1 PowerShell sp=1 8\Engine\Binaries\Win64\UnrealEditor.exe |  -ArgumentList $args -PassThru
  1 PowerShell sp=1 8\Engine\Binaries\Win64\UnrealEditor.exe |  -ArgumentList $argv -PassThru
  8 Bash       sp=0 8/Engine/Binaries/Win64/UnrealEditor.exe |  'C:\Projects\bws.game.tms\TMS.uproject' > /dev/null 2>&1 
  1 PowerShell sp=1 8\Engine\Binaries\Win64\UnrealEditor.exe |  -ArgumentList '"C:\Projects\bws.game.tms\TMS.uproject"'
  3 Bash       sp=0 8/Engine/Binaries/Win64/UnrealEditor.exe |  \ "C:\Projects\street-war\StreetWar.uproject" \ -nosplash -NoLiveCoding -stdout -FullStdOutLogOutput \ > "$RU
  1 Bash       sp=0 8/Engine/Binaries/Win64/UnrealEditor.exe |  \ "C:\Projects\street-war\StreetWar.uproject" \ "/Game/StreetWar/Maps/M_F5_RetargetProof" \ -nosplash -NoLive
  1 Bash       sp=0 8/Engine/Binaries/Win64/UnrealEditor.exe |  \ "C:\Projects\street-war\StreetWar.uproject" \ -nosplash -NoLiveCoding -stdout -FullStdOutLogOutput \ > runs
  1 Bash       sp=0 8/Engine/Binaries/Win64/UnrealEditor.exe |  \ "C:\Projects\street-war\StreetWar.uproject" \ -nosplash -NoLiveCoding -stdout -FullStdOutLogOutput \ > "$R/
  4 Bash       sp=0 8/Engine/Binaries/Win64/UnrealEditor.exe |  \ "C:\Projects\street-war\StreetWar.uproject" -nosplash -NoLiveCoding -stdout -FullStdOutLogOutput \ > "$R/ev
 24 PowerShell sp=1 8\Engine\Binaries\Win64\UnrealEditor.exe |  -ArgumentList '"C:\Projects\tmsUnreal\tmsUnreal.uproject"'
  2 PowerShell sp=1 8/Engine/Binaries/Win64/UnrealEditor.exe |  -ArgumentList $args -PassThru
  6 PowerShell sp=1 8\Engine\Binaries\Win64\UnrealEditor.exe |  -ArgumentList @('"C:/Projects/tmsUnreal/tmsUnreal.uproject"','/Game/Heim/Maps/L_World','-NoLiveCoding','-Heim
  1 Bash       sp=0 8/Engine/Binaries/Win64/UnrealEditor.exe |  \ C:/Projects/tmsUnreal-npc-ai/tmsUnreal.uproject /Game/Heim/Maps/L_World \ -NoLiveCoding -HeimVerificationSe
  1 PowerShell sp=1 8\Engine\Binaries\Win64\UnrealEditor.exe |  -ArgumentList '"C:\Projects\tmsUnreal-input\tmsUnreal.uproject"','-log=input-settings-editor-session.log','-N
  1 PowerShell sp=1 8\Engine\Binaries\Win64\UnrealEditor.exe |  -ArgumentList '"C:\Projects\tmsUnreal-input\tmsUnreal.uproject"','-log=input-settings-editor-session2.log','-
  1 PowerShell sp=1 8\Engine\Binaries\Win64\UnrealEditor.exe |  -ArgumentList '"C:\Projects\tmsUnreal-input\tmsUnreal.uproject"','-log=input-settings-editor-session3.log','-
  1 PowerShell sp=1 8\Engine\Binaries\Win64\UnrealEditor.exe |  -ArgumentList '"C:\Projects\tmsUnreal-input\tmsUnreal.uproject"','-log=input-settings-editor-session4.log','-
  1 PowerShell sp=1 8\Engine\Binaries\Win64\UnrealEditor.exe |  -ArgumentList '"C:\Projects\tmsUnreal-input\tmsUnreal.uproject"','-log=input-settings-editor-session5.log','-
  1 Bash       sp=0 8/Engine/Binaries/Win64/UnrealEditor.exe |  "C:/Projects/tmsUnreal/tmsUnreal.uproject" /Game/NPC/Tests/Lvl_NpcAcceptance > /dev/null 2>&1 
  2 PowerShell sp=1 8\Engine\Binaries\Win64\UnrealEditor.exe |  -ArgumentList '"C:\Projects\xwing\XvT\XvT.uproject" /Game/Maps/Planets'
  1 PowerShell sp=1 6\Engine\Binaries\Win64\UnrealEditor.exe |  -ArgumentList '"C:\Projects\xwing\XvT\XvT.uproject"'
  2 PowerShell sp=1 8\Engine\Binaries\Win64\UnrealEditor.exe |  -ArgumentList '"C:\Projects\tmsUnreal-monastery\tmsUnreal.uproject"','-NoLiveCoding'
  1 Bash       sp=0 8/Engine/Binaries/Win64/UnrealEditor.exe |  "C:/Projects/tmsUnreal/tmsUnreal.uproject" > "$TMP/ue-launch.log" 2>&1
  1 Bash       sp=0 8/Engine/Binaries/Win64/UnrealEditor.exe |  "C:/Projects/tmsUnreal/tmsUnreal.uproject" > "$TMP/ue-launch2.log" 2>&1
  2 PowerShell sp=1 8\Engine\Binaries\Win64\UnrealEditor.exe |  -ArgumentList "`"$proj`"","/Game/Heim/Maps/L_World" -WindowStyle Normal -PassThru
  1 PowerShell sp=1 8\Engine\Binaries\Win64\UnrealEditor.exe |  -ArgumentList "`"$uproject`"", "/Game/Heim/Maps/L_World" -WindowStyle Normal -PassThru
  2 PowerShell sp=1 8\Engine\Binaries\Win64\UnrealEditor.exe |  -ArgumentList "`"$root\tmsUnreal.uproject`"", "/Game/Heim/Maps/L_World" -WindowStyle Normal -PassThru
```

## Unity rewrites
```
### unityFix: 3 triggers
  cd C:/Projects/animation.station && timeout 900 unity open 'C:/Projects/animation.station-wph' 2>&1 | tail -5
     => cd C:/Projects/animation.station && timeout 900 unity open 'C:/Projects/animation.station-wph' --args -automated 2>&1 | tail -5
  cd /c/Projects/bws.iron-canopy; unity open 'C:\Projects\bws.iron-canopy' --non-interactive >/dev/null 2>&1 & R=runs/2026-09-23-g1-android-device; SDK="/c/Program Files/Unity/Hub/Editor/6000.6.0f1/Edit
     => gn-16k.txt; sha256sum Builds/Android/IronCanopy-dev.apk | tee $R/apk.sha256; adb install -r Builds/Android/IronCanopy-dev.apk 2>&1 | tail -2
  cd C:/Projects/tms-heim && echo "=== is the catalog even consumed? ===" && sed -e 's/\r$//' Assets/_Project/World/Buildings/Monastery/Archive/Blueprints/BP_Archive.asset | grep -nE "moduleRequirements
     =>  --args -automated > runs/2026-09-02-archive-initial-analysis/archive-r2-apply/editor-launch.json 2>&1 &) && sleep 5 && echo "launch issued"

```
