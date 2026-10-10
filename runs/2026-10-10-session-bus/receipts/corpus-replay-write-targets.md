# Corpus replay: Session Bus shell write targets

Corpus: 77784 distinct Bash/PowerShell commands (last 30 days, day-job projects excluded).
Commands with at least one write target: 10627; targets: 14917; replay time 3833 ms (49.3 µs per command).

| via | targets |
|---|---|
| redirect | 8999 |
| sed -i | 2737 |
| cp | 1709 |
| tee | 587 |
| cmdlet | 459 |
| mv | 259 |
| mv source | 167 |

## Targets worth a look (no folder or extension, or stray punctuation): 2
```
Bash       sed -i    E=1                                                <= sed -i 's/2,028 to 2,152 triangles at LOD0/2,004 to 2,128 triangles at LOD0/' docs/GDD.md E=1 2>/dev/null; sed -i 's/2,028 to 2,152/2,004 to
Bash       cp        bin3                                               <= cp -r bin2 bin3 && (dotnet test bin2/Pit.Sim.dll --logger "console;verbosity=normal" > ../../evidence/dotnet-regression.txt 2>&1 &) ; for st
```

## Sample: cp (1709)
```
Bash       cp        ./precog.css                                       <= python3 - <<'EOF' p='build_report.py' t=open(p,encoding='utf-8').read() t=t.replace('("warn", "medium", "reaction-avatar-studio keeps','("ba
Bash       cp        evidence/t06-agent-log.txt/logcat-agent.txt        <= export ANDROID_SERIAL=47171HFH80BF5R && python scratch/db.py "select 1" >/dev/null && python - <<'EOF' import json, sqlite3, statistics rows
Bash       cp        .ds-sync/lib                                       <= S="/c/Users/bsmi0/AppData/Local/Temp/claude/bundled-skills/2.1.284/5698e7ad5e87f6ab2cd1f77a6933ba26/design-sync"; cp -r "$S"/package-build.m
Bash       cp        /c/Projects/bws.android.scribe/runs/2026-09-25-m5-c2-catalog/evidence/regression/nbk02-c2-run3-TEST.xml <= cd /c/Projects/bws.android.scribe && /c/Android/Sdk/platform-tools/adb.exe -s 47171HFH80BF5R shell pm list packages | grep -i inkwell; grep 
Bash       cp        /c/Projects/tmsUnreal/runs/2026-09-13-character-configurations/scratch-suites/TmsCharacterActionQualificationTests.pre-review.cpp <= cd /c/Projects/tmsUnreal && sed -n 15,45p Source/tmsUnreal/Inventory/TmsInventoryContainer.h; cp Source/tmsUnreal/Tests/Qualification/TmsCha
Bash       cp        /tmp/cs.bak                                        <= cd /c/Projects/bws.game.pit-maneuver && F=Assets/_Game/Sim/Collision/ContactSolver.cs && cp $F /tmp/cs.bak && sed -i 's/closing > 1 ? 1.04 :
Bash       cp        /tmp/spec.bak/VEHICLE-SPEC.md                      <= cd /c/Projects/bws.game.pit-maneuver; R=runs/2026-10-06-pitu-veh-01-vehicle-art-and-damage-spec; printf 'bin/\nobj/\n' > $R/scratch/dotnet/.
Bash       cp        /tmp/esc.bak/PursuerEscalation.cs                  <= cd /c/Projects/bws.game.pit-maneuver && python - <<'EOF' p='Assets/_Game/Sim/Ai/PursuerSquad.cs' s=open(p,encoding='utf-8').read() s=s.repla
Bash       cp        /c/Projects/bws.game.pit-maneuver/runs/2026-10-08-pitu-tgt-02-archetype-framework/scratch/dotnet/vehicle.csproj <= cd /c/Projects/bws.game.pit-maneuver/runs/2026-10-08-pitu-tgt-02-archetype-framework && mkdir -p scratch/dotnet evidence && cp ../2026-10-07
Bash       cp        /c/Projects/bws.game.tms/Config/DefaultEditor.ini  <= cd /c/Projects/bws.game.tms; T="/c/Program Files/Epic Games/UE_5.8/Templates/TP_Blank"; mkdir -p Config Source/TMS Source/TMSEditor Content 
Bash       cp        runs/2026-09-27-m1-u9-gap-latch/L_Test_Route.backup.umap <= cat > runs/2026-09-27-m1-u9-gap-latch/dbg_delete.py <<'EOF' import unreal p="/Game/Test/Maps/L_Test_Route" eal=unreal.EditorAssetLibrary r=e
Bash       cp        kennelman_clips.prev3.blend                        <= B="/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"; cp kennelman_clips.blend kennelman_clips.prev3.blend; "$B" -b kennelman_cli
Bash       cp        Saved/AnimSource/KI2/HumanM_HandWave01.fbx         <= cp runs/2026-09-28-m1-u15-dungeon-feel/scratch/kiprep/HumanM_HandWave01.fbx Saved/AnimSource/KI2/ && sed -n 1,19p Tools/Content/build_m1_ani
Bash       cp        /tmp/sh.bak                                        <= F=Assets/IronCanopy/Runtime/Session/SimulationHost.cs && cp $F /tmp/sh.bak && python - <<'EOF' p='Assets/IronCanopy/Runtime/Session/Simulati
Bash       cp        ../runs/2026-10-02-repo-sessions-pane/peers.test.bak/peers.test.ts <= cp tests/peers.test.ts ../runs/2026-10-02-repo-sessions-pane/peers.test.bak && python - <<'EOF' p='tests/peers.test.ts' s=open(p,encoding='u
Bash       cp        C:/Projects/bws.portfolio-fabricator/.swarm-shot.mjs <= python - <<'EOF' p = "index.html" s = open(p, encoding="utf-8").read() def rep(a, b): global s assert s.count(a) == 1, a[:60] s = s.replace(
Bash       cp        art/axo-rig/ASSETS.json/axo-assets.json            <= python - <<'EOF' import hashlib, os, json def sha(p): h=hashlib.sha256() with open(p,'rb') as f: for c in iter(lambda: f.read(1<<24), b''): 
Bash       cp        ./playwright.swgl.config.ts                        <= grep -rn "foreground-portrait\|111956" tests scripts docs/*.json 2>/dev/null | head -5; powershell -NoProfile -Command "foreach (\$p in 3312
Bash       cp        /tmp/store.ts.bak/store.ts                         <= cp src/store.ts /tmp/store.ts.bak && python3 - <<'EOF' 2>/dev/null || node -e ' const fs=require("fs");let s=fs.readFileSync("src/store.ts",
Bash       cp        /c/tmp/g5/art.tail.js/art.js                       <= sed -i 's/lowTail.append(box(.28,.12,.02),\[side\*(utility?W\*.84-.13:.66),tailY,tailZ(tailY)\])/lowTail.append(box(.28,.12,.02),[side*(util
Bash       cp        runs/2026-09-21-v1-v8-vehicles/tools/discover_api.py <= cat > /tmp/disc.py <<'EOF' import unreal m=unreal.load_asset('/Game/Synty/City/Meshes/VehiclesRigged/SK_Veh_Car_Sedan_01.SK_Veh_Car_Sedan_01
Bash       cp        C:/Projects/tms-heim/runs/2026-09-29-berrit-kitbash/../2026-10-02-berrit-model-inspection/after_audit_occlusion.json/audit_occlusion.json <= cd C:/Projects/tms-heim/runs/2026-09-29-berrit-kitbash; BLENDER_BRIDGE_PORT=9876 bash scripts/audit.sh 2>&1 | tail -3; py -3 - <<'PY' import
Bash       cp        /c/Projects/tms-heim/runs/2026-09-29-berrit-kitbash/scripts/./bl.py <= mkdir -p /c/Projects/tms-heim/runs/2026-09-29-berrit-kitbash/{scripts,shots,donors,props} /c/Projects/tms-heim/art/berrit && cd /c/Projects/
Bash       cp        C:/Projects/tms-ui/runs/2026-10-08-ui-ui6-ui-setting-rows/build_ui_settings.json <= cd C:/Projects/tms-ui && cp Saved/Content/build_ui_settings.json runs/2026-10-08-ui-ui6-ui-setting-rows/build_ui_settings.json && python Too
Bash       cp        C:/Projects/tmsUnreal/runs/2026-09-11-core-systems-implementation/receipts/core3-pause-player-tests.json <= cd "C:/Projects/tmsUnreal" && R=runs/2026-09-07-unity-unreal-parity-implementation/receipts && cp $R/core3-pause-build.json $R/core3-pause-s
```

## Sample: redirect (8999)
```
Bash       redirect  RUNLOG.md                                          <= cat >> RUNLOG.md <<'EOF' ## Interview (same day): what to remove - 6 rounds, quick depth. Result: `DECISIONS.md` (dispositions for all 167 f
Bash       redirect  docs/PLATFORM-NOTES.md                             <= cat >> docs/PLATFORM-NOTES.md <<'EOF' ## 34. Background transcription facts (M7 D3, 2026-10-03) ### 34.1 The editor may not reach `InkwellAg
Bash       redirect  runs/2026-09-28-m6-design/RUNLOG.md                <= cat >> runs/2026-09-28-m6-design/RUNLOG.md <<'EOF' ## 2026-09-28 — D5 E1 foundation `InkwellTheme.kt` → M6 tokens (paper, raisedPaper, sunkP
Bash       redirect  runs/2026-10-03-m7-d5-chat-split/move_chat.py      <= cat > runs/2026-10-03-m7-d5-chat-split/move_chat.py <<'EOF' import re p = 'core/pil/src/main/kotlin/com/bws/inkwell/core/pil/InkwellAgent.kt
Bash       redirect  tools/felt-character/blender/felt_geo.py           <= sed 's/"""Quad-only primitive builders for the Axo pieces (run inside the Axo Blender; PID-guarded by callers)./"""Felt character pipeline —
Bash       redirect  /c/Projects/bws.game.pit-maneuver/Assets/_Game/Audio/UiAudioSink.cs <= cd /c/Projects/bws.game.pit-maneuver/Assets/_Game; mkdir -p UI/Sound cat > Game/Services/IUiAudioSink.cs <<'EOF' using UnityEngine; namespac
Bash       redirect  /c/Projects/bws.game.pit-maneuver/Assets/_Game/World/Signals/TrafficSignals.cs <= mkdir -p /c/Projects/bws.game.pit-maneuver/Assets/_Game/World/Signals && cd /c/Projects/bws.game.pit-maneuver/Assets/_Game/World/Signals && 
Bash       redirect  runs/2026-10-08-pitu-sim-11-fixed-step-runtime-driver/evidence/gate-output.txt <= git status --short | wc -l; python tools/pitu-harness/harness.py gate > runs/2026-10-08-pitu-sim-11-fixed-step-runtime-driver/evidence/gate-
Bash       redirect  PlayFromHereReceiver.cs                            <= cat > PlayFromHereRequest.cs <<'E' using Pit.Sim.Vehicle; using Pit.Sim.World; namespace Pit.World { /// <summary>Everything a play-from-her
Bash       redirect  Assets/_Game/Audio/Ambience/AmbienceFade.cs        <= mkdir -p Assets/_Game/Audio/Ambience && cd Assets/_Game/Audio/Ambience && cat > AmbienceTable.cs <<'EOF' using System; using Pit.Content; na
Bash       redirect  runs/2026-10-04-peel-healer-band/feel-run2.log     <= sed -i 's/interior arm interior arm/interior arm/g; s|constexpr double ActualArmMinFraction = 0.9; // collision under the 2.4 m ceiling may 
Bash       redirect  runs/2026-09-26-m1-u5b-groups/fast8.log            <= python Tools/Harness/run.py fast > runs/2026-09-26-m1-u5b-groups/fast8.log 2>&1; echo exit=$?; grep "TMS harness\|report:" runs/2026-09-26-m
Bash       redirect  /c/Projects/bws.game.tms/runs/2026-10-04-bk0-foundation/logs/import_anims.log <= cd /c/Projects/bws.game.tms && TMS_ANIM_PACKS=Protector "/c/Program Files/Epic Games/UE_5.8/Engine/Binaries/Win64/UnrealEditor-Cmd.exe" "C:\
Bash       redirect  runs/2026-10-02-ui-technique-hud/visual_step3.log  <= python Tools/Harness/run.py visual --only TMS.Full.Playtest.Warden.KitVisual > runs/2026-10-02-ui-technique-hud/visual_step3.log 2>&1; echo 
Bash       redirect  runs/2026-10-07-m2-coverage/spec_m2_mentions.txt   <= for f in docs/design/specs/*.md docs/specs/*.md; do n=$(grep -c "\bM2\b" $f); [ "$n" -gt 0 ] && echo "$n $f"; done; grep -n "\bM2\b" docs/de
Bash       redirect  runs/2026-09-29-warden-w1-temper/full-s8.log       <= python Tools/Harness/run.py full --skip-soak > runs/2026-09-29-warden-w1-temper/full-s8.log 2>&1; tail -8 runs/2026-09-29-warden-w1-temper/f
Bash       redirect  runs/2026-09-24-canopy-g3-mission-save/gate-baseline.txt <= python -u tools/unity-gate.py > runs/2026-09-24-canopy-g3-mission-save/gate-baseline.txt 2>&1
Bash       redirect  ../server-3100.log                                 <= node -e ' const fs=require("fs");const f="tests/e2e/home-reveal-latch.spec.ts";let s=fs.readFileSync(f,"utf8"); const start=s.indexOf("async
Bash       redirect  /tmp/t.py                                          <= cd /c/Projects/bws.portfolio-fabricator/runs/2026-10-01-fabricator-t-92-fabricator-webgl && cat > /tmp/t.py <<'EOF' from pathlib import Path
Bash       redirect  /c/Projects/bws.web.pinkgill/runs/2026-09-30-axo-arm-twist/sheet.py <= cd /c/Projects/bws.web.pinkgill/runs/2026-09-30-axo-arm-twist && cat > sheet.py <<'EOF' # Contact sheet: python sheet.py <dir> <out> <first>
Bash       redirect  /c/Projects/bws.game.pit-maneuver/runs/2026-10-04-pitu-harness/RUNLOG.md <= cd /c/Projects/bws.game.pit-maneuver && cat >> runs/2026-10-04-pitu-harness/RUNLOG.md <<'EOF' - 23:04 PLT-05 tripped the guard a third time 
Bash       redirect  /c/Projects/street-war/runs/2026-09-18-f7-anim-qa/tools/f7_capture.py <= cd /c/Projects/street-war cat > runs/2026-09-18-f7-anim-qa/tools/f7_capture.py <<'PYEOF' """Drive unreal-mcp CaptureViewport over HTTP and V
Bash       redirect  /c/Projects/tms-heim/runs/2026-10-08-kennelman-kitbash/scripts/idpass2.py <= cd /c/Projects/tms-heim/runs/2026-10-08-kennelman-kitbash; sed 's/sh.show_backface_culling = True/sh.show_backface_culling = globals().get("
Bash       redirect  C:/Projects/tms-heim/da_meta_list.tmp.txt          <= cd C:/Projects/tms-heim && pwd git ls-files "Assets/CodeRespawn/DungeonArchitect/**/*.cs.meta" > da_meta_list.tmp.txt wc -l da_meta_list.tmp
Bash       redirect  /c/Users/bsmi0/.claude/projects/C--Projects-tmsUnreal/memory/MEMORY.md <= printf -- '- [Retarget twist needs spread, not max](retarget-twist-needs-spread-not-max.md) - positional checks miss twist; rotation-delta S
```

## Sample: sed -i (2737)
```
Bash       sed -i    INTERVIEW-BRIEF.md                                 <= cat >> RUNLOG.md <<'EOF' ## Interview (same day): what to remove - 6 rounds, quick depth. Result: `DECISIONS.md` (dispositions for all 167 f
Bash       sed -i    runs/2026-10-03-m7-d3-background-ocr/TASKS.md      <= sed -i 's/^- \[ \] T06/- [x] T06/' runs/2026-10-03-m7-d3-background-ocr/TASKS.md && sed -i 's/^- \[ \] T07/- [~] T07/' runs/2026-10-03-m7-d3
Bash       sed -i    docs/SPEC-M7.md                                    <= sed -i 's#| \*\*Harness\*\* | `/m7-harness`, built like M4 and M5. \*\*Not built yet.\*\* |#| **Harness** | `/m7-harness` (`tools/m7-harness
Bash       sed -i    /c/Projects/bws.frisbee/runs/2026-09-11-synty-collider-audit/ColliderAudit.cs <= cd /c/Projects/bws.frisbee/runs/2026-09-11-synty-collider-audit && sed -i 's|^ \[MenuItem("Tools/Run Synty Collider Audit")\]$||' ColliderAu
Bash       sed -i    Assets/_Game/Editor/World/RouteD2Showcase.cs       <= sed -i 's/S("10-one-way-corner", 1679f, 7f, 2.3f, 1680f, 12.2f, 2.3f, 28f)/S("10-one-way-signs-plaza", 2613f, 6f, 2.4f, 2613f, -14f, 2.0f, 5
Bash       sed -i    runs/2026-10-08-pitu-tgt-04-weaver/TASKS.md        <= sed -i 's/^- \[ \] T04/- [~] T04/' runs/2026-10-08-pitu-tgt-04-weaver/TASKS.md && git add -f runs/2026-10-08-pitu-tgt-04-weaver && git commi
Bash       sed -i    docs/CIVILIAN-CARS.md                              <= python runs/2026-10-07-pitu-wld-22-civilian-traffic-vehicle-set/evidence/patch_chamfer.py && sed -i 's/CivHatch/CivSport/g' docs/CIVILIAN-CA
Bash       sed -i    Assets/_Game/Game.PlayTests/SimDriverPlayTests.cs  <= sed -i 's/^using Pit.Sim.Vehicle;/using Pit.Sim.Vehicle;\nusing Pit.Sim.World;/' Assets/_Game/Editor.Tests/SimDriverTests.cs Assets/_Game/Ga
Bash       sed -i    /c/Projects/bws.game.pit-maneuver/Assets/_Game/Sim/Numerics/SimBinary.cs <= cd /c/Projects/bws.game.pit-maneuver/Assets/_Game/Sim && mv Facade/SimBinary.cs Numerics/SimBinary.cs && sed -i 's/namespace Pit.Sim.Facade/
Bash       sed -i    runs/2026-10-10-pitu-uix-09-chapter-results-screen/TASKS.md <= cat > runs/2026-10-10-pitu-uix-09-chapter-results-screen/RUNLOG.md <<'EOF' # UIX-09 RUNLOG ## Session 1 (2026-10-10) - Objective: chapter re
Bash       sed -i    C:/Projects/bws.game.pit-maneuver/Assets/_Game/UI.PlayTests/HandoffRenderTests.cs <= cd C:/Projects/bws.game.pit-maneuver; sed -i 's/stage.style.backgroundColor = new Color32(\(.*\), 255);/stage.style.backgroundColor = (Color
Bash       sed -i    /c/Projects/bws.game.tms/Source/TMSTests/Private/Playtest/TmsFeelToolsPlayTests.cpp <= cd /c/Projects/bws.game.tms && sed -i 's/&& FullHp(S, TmsTelemetryNames::Alrec)/\&\& TmsPlaytestFull::FullHp(S, TmsTelemetryNames::Alrec)/' 
Bash       sed -i    /c/Projects/bws.game.tms/runs/2026-09-25-unreal-spike/import_ai.py <= cd /c/Projects/bws.game.tms/runs/2026-09-25-unreal-spike; rm -f /c/Projects/bws.game.tms/Content/Spike/AI/*.uasset; sed -i 's#"import_mesh":
Bash       sed -i    runs/2026-09-26-m1-u1-party-input/TASKS.md         <= sed -i 's/^- \[ \] T01 /- [~] T01 /' runs/2026-09-26-m1-u1-party-input/TASKS.md && grep -n "T01" runs/2026-09-26-m1-u1-party-input/TASKS.md 
Bash       sed -i    runs/2026-09-28-m1-u15-dungeon-feel/scratch/cast_clips.txt <= sed -i 's#^/c/#C:/#' runs/2026-09-28-m1-u15-dungeon-feel/scratch/cast_clips.txt && "/c/Program Files/Blender Foundation/Blender 5.2/blender.
Bash       sed -i    runs/2026-10-07-gh1/gen_audit.py                   <= sed -i 's/if p in ("PRG", "PRD", "TEC", "SAV", "AST", "NAR", "CHO", "BOS", "STM", "VIS", "SPEC"):/if gdd == "NAR-12":\n return "Presentation
Bash       sed -i    runs/2026-09-23-canopy-g1-motor-touch/TASKS.md     <= sed -i 's/^- \[~\] T05 /- [x] T05 /' runs/2026-09-23-canopy-g1-motor-touch/TASKS.md && git add -A && git commit -qm "G1-5: InputRouter + Pla
Bash       sed -i    hooks/register.tsx                                 <= sed -i 's/{fit(next, width - head.length)}/{fit(nextStep, width - head.length)}/' hooks/register.tsx && grep -n "fit(nextStep" hooks/registe
Bash       sed -i    runs/2026-09-14-chapter-two-perf/refute-mv-partials.mjs <= sed -i 's/const bad = frames.filter((f) => f.smooth || f.state !== "STATE_PRESENTED_ALL");/const bad = frames.filter((f) => f.state === "STA
Bash       sed -i    runs/2026-09-30-axo-arm-twist/harness.html         <= sed -i 's#await (await fetch("/public/assets/axo/axo-swim.glb")).arrayBuffer()#await (await fetch(qs.get("glb") || "/public/assets/axo/axo-s
Bash       sed -i    C:/Projects/pil-agent-plugin/pil-agent-plugin/tests/test_character_sheet_review.py <= cd C:/Projects/pil-agent-plugin/pil-agent-plugin; sed -i 's/"0\.9\.6"/"0.10.0"/' tests/test_character_sheet_review.py tests/test_components.
Bash       sed -i    runs/2026-09-29-pitm-g1-gfx-light/TASKS.md         <= sed -i 's/^- \[~\] T05 /- [x] T05 /' runs/2026-09-29-pitm-g1-gfx-light/TASKS.md && sed -i '/^- \[x\] T05 /a\ - note: high renders linear HDR
Bash       sed -i    C:/Projects/tms-heim/runs/2026-10-01-alrec-kitbash/scripts/pass6_inspfix.py <= cd C:/Projects/tms-heim/runs/2026-10-01-alrec-kitbash/scripts; sed -i 's/SLEEVE_END = P.get("sleeve_end", 0.585) # forearm verts nearer the 
Bash       sed -i    /c/Projects/tms-heim/runs/2026-09-30-elric-kitbash/scripts/pass4_head.py <= cd /c/Projects/tms-heim/runs/2026-09-30-elric-kitbash/scripts; sed -i 's/tonsure_back_z=1.765, nape_z=1.69/tonsure_back_z=1.745, nape_z=1.69
Bash       sed -i    .codex/config.toml                                 <= git log --oneline -3 | cat; ls Source/TMS/Public/UI/System/TmsUiPageHost.h && mkdir -p runs && cp -r /c/Projects/bws.game.tms/runs/2026-10-0
```

## Sample: tee (587)
```
Bash       tee       /c/Projects/bws.android.scribe/runs/2026-09-21-m1-inking/evidence/probe/probe-analysis.txt <= cd /c/Projects/bws.android.scribe/runs/2026-09-21-m1-inking && rm -f evidence/probe/probe-analysis.json evidence/probe/probe-analysis.txt &&
Bash       tee       runs/2026-09-21-m1-inking/evidence/probe/probe-analysis.txt <= T="C:/Users/bsmi0/AppData/Local/Temp/claude/C--Projects-bws-android-scribe/0231ee0d-0992-4d6d-8e95-5c6fdbe1656a/scratchpad" export ADB=/c/An
Bash       tee       evidence/regression/b1/ain03-export.txt            <= export ANDROID_SERIAL=47171HFH80BF5R MSYS_NO_PATHCONV=1 PYTHONIOENCODING=utf-8 PATH="/c/Android/Sdk/platform-tools:$PATH"; adb exec-out run-
Bash       tee       evidence/ac-ocr7-04.txt                            <= export ANDROID_SERIAL=47171HFH80BF5R MSYS_NO_PATHCONV=1 PYTHONIOENCODING=utf-8; for w in "LIFT" "EXAM" "VELX"; do python scratch/handwrite.p
Bash       tee       runs/2026-09-23-m4-b2-pil-runtime/evidence/t11-cap-instrumented.result.json <= ./gradlew :core:pil:installDebugAndroidTest -q 2>&1 | grep -v "Unable to strip\|^\s*$" | tail -5; P=com.bws.inkwell.core.pil.test; adb shell
Bash       tee       grayscale-settings.txt                             <= export MSYS_NO_PATHCONV=1 && E=$(adb shell settings get secure accessibility_display_daltonizer_enabled | tr -d '\r'); D=$(adb shell setting
Bash       tee       runs/2026-10-02-agent-speed/evidence/per-feature-split.txt <= grep -n -i "limit\|200\|delete\|prune\|keep" core/data/src/main/kotlin/com/bws/inkwell/core/data/RoomToolTraceStore.kt | head; cd runs/2026-
Bash       tee       /c/Projects/bws.android.scribe/runs/2026-10-03-m7-d10-device-pass/evidence/spend-after.txt <= cd /c/Projects/bws.android.scribe/runs/2026-10-03-m7-d10-device-pass && export ANDROID_SERIAL=47171HFH80BF5R MSYS_NO_PATHCONV=1 PYTHONIOENCO
Bash       tee       evidence/regression/act01-share.txt                <= export ANDROID_SERIAL=47171HFH80BF5R PYTHONIOENCODING=utf-8 MSYS_NO_PATHCONV=1 && N=$(python scratch/ui.py dump | grep -c "'Share…'"); pytho
Bash       tee       scratch/rotation-before.txt                        <= export MSYS_NO_PATHCONV=1 && ar=$(adb shell settings get system accelerometer_rotation); ur=$(adb shell settings get system user_rotation); 
Bash       tee       /c/Projects/bws.game.pit-maneuver/runs/2026-10-07-pitu-aud-05-ui-sound-set/evidence/verify-aud05.txt <= cd /c/Projects/bws.game.pit-maneuver; powershell -NoProfile -ExecutionPolicy Bypass -File tools/verify.ps1 -Tag aud05 2>&1 | tail -15 | tee 
Bash       tee       runs/2026-10-05-pitu-prg-05-garage-logic/evidence/verify.txt <= mkdir -p runs/2026-10-05-pitu-prg-05-garage-logic/evidence && powershell -NoProfile -ExecutionPolicy Bypass -File tools/verify.ps1 -Tag prg0
Bash       tee       runs/2026-10-04-pitu-fnd-04-scene-architecture-and-service-bootstrap/playmode-run5.txt <= python - <<'EOF' p='Assets/_Game/Game.PlayTests/SceneFlowPlayTests.cs' t=open(p).read() t=t.replace("while (SceneManager.GetActiveScene().na
Bash       tee       runs/2026-10-09-pitu-wld-23-region-optimisation/evidence/tests-routeoptimiser-2.txt <= U="$LOCALAPPDATA/Unity/bin/unity.exe"; for i in $(seq 1 40); do r=$("$U" command test_status --project-path C:/Projects/bws.game.pit-maneuve
Bash       tee       /c/Projects/bws.game.pit-maneuver/runs/2026-10-09-pitu-par-03-parity-gate/scratch/mut/../../evidence/mutation-proof.txt <= cd /c/Projects/bws.game.pit-maneuver/runs/2026-10-09-pitu-par-03-parity-gate/scratch/mut && { echo "Mutation: copy of Assets/_Game/Sim with 
Bash       tee       runs/2026-10-05-pitu-wld-04-interstate-environment-kit/evidence/kit-tests-run6.txt <= python - <<'EOF' p='Assets/_Game/Editor.Tests/InterstateKitTests.cs' s=open(p,encoding='utf-8').read() a=''' Assert.GreaterOrEqual(out_ / (f
Bash       tee       runs/2026-10-07-pitu-prg-06-mod-effects-in-the-sim/evidence/verify.txt <= powershell -NoProfile -ExecutionPolicy Bypass -File tools/verify.ps1 -Tag prg06 2>&1 | tee runs/2026-10-07-pitu-prg-06-mod-effects-in-the-si
Bash       tee       /c/Projects/bws.game.tms/runs/2026-09-25-asset-manifest/inventory/scan_new_packs.txt <= cd /c/Projects/bws.game.tms/runs/2026-09-25-asset-manifest; cat > inventory/scan_new_packs.py <<'EOF' """Catalogue clips + model names of th
Bash       tee       runs/2026-10-07-f7-review-fixes/build_feedback.log <= python Tools/Content/run_live_python.py Tools/Content/build_feedback.py 2>&1 | tee runs/2026-10-07-f7-review-fixes/build_feedback.log | tail
Bash       tee       receipts/probe3.txt                                <= cat > probe3.py <<'EOF' """Quantify candidate signals: Monitor schema errors, sleep blocks, 600 s waits, long-command shapes, python-heredoc
Bash       tee       C:/Projects/bws.motion.library/.claude/worktrees/agent-ac704aa6967868735/runs/2026-09-10-polish-primitive-p-04-velocity-marquee/iter7-typecheck.log <= cd "C:/Projects/bws.motion.library/.claude/worktrees/agent-ac704aa6967868735" && set -o pipefail && export MOTION_DOCS_PORT=4179 MOTION_REAC
Bash       tee       C:/Projects/pil-agent-plugin/pil-agent-plugin/runs/2026-09-30-blender-inspect-u5-depth-order/evidence/focused-gate.txt <= cd C:/Projects/pil-agent-plugin/pil-agent-plugin && uv run --extra reconstruction --extra embedding pytest -q -p no:cacheprovider plugins/bl
Bash       tee       C:/Projects/tms-heim/runs/2026-10-02-alrec-anselm-inspection/alrec_fix_diff.txt <= cd C:/Projects/tms-heim/runs/2026-10-02-alrec-anselm-inspection; py -3 - <<'PY' | tee alrec_fix_diff.txt import json def load(p): d=json.loa
Bash       tee       ../capetrim/compare_p13_vs_rev8.txt                <= cd .. && BL="/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"; RT=C:/Projects/bws.game.tms/Tools/Content/Source/Kennelman/CapeTr
Bash       tee       boot2-life.txt                                     <= echo "##### FULL LIFE OF BOOT #2: 09:54:30 -> 10:00:42 (hang #2) #####" && powershell.exe -NoProfile -Command "Get-WinEvent -FilterHashtable
```

## Sample: mv (259)
```
Bash       mv        core/model/src/main/kotlin/com/bws/inkwell/core/model/OpId.kt <= git mv core/model/src/main/kotlin/com/bws/inkwell/core/model/Ids.kt core/model/src/main/kotlin/com/bws/inkwell/core/model/OpId.kt 2>/dev/nul
Bash       mv        spike/probes/3-ocr-fast-path-drawings-run1.json/3-ocr-fast-path.json <= VARIANT=drawings python spike/probe.py ocr 2 12 2>&1 | tail -12 && mv spike/probes/3-ocr-fast-path.json spike/probes/3-ocr-fast-path-drawing
Bash       mv        evidence/t08-real-approve-by-mistake-db.txt        <= export ANDROID_SERIAL=47171HFH80BF5R PATH="/c/Android/Sdk/platform-tools:$PATH" PYTHONIOENCODING=utf-8 && for i in $(seq 1 60); do sleep 4; 
Bash       mv        briefs/D5.md                                       <= mkdir -p briefs && mv D2.md D3.md D4.md D5.md D6.md D7.md D8.md D9.md D10.md briefs/ && ls briefs
Bash       mv        /c/Projects/bws.android.scribe/runs/2026-10-03-m7-d10-device-pass/evidence/ac-reg-01/SUMMARY.md <= cd /c/Projects/bws.android.scribe/runs/2026-10-03-m7-d10-device-pass/evidence/ac-reg-01 && { echo "> NOTE: the m7L (loaded) column and the '
Bash       mv        runs/2026-09-11-owner-decisions/headless-e2e-source-2560x1600-harness.log/headless-e2e-harness.log <= mv runs/2026-09-11-owner-decisions/headless-e2e.json runs/2026-09-11-owner-decisions/headless-e2e-source-2560x1600.json && mv runs/2026-09-1
Bash       mv        C:/Projects/bws.frisbee/runs/2026-09-14-rottweiler-blender-model/RUNLOG.md.bak/RUNLOG.md <= cd "C:/Projects/bws.frisbee/runs/2026-09-14-rottweiler-blender-model" && mv RUNLOG.md RUNLOG.md.bak && echo "moved aside"
Bash       mv        work/smoke/UE5-IMPORT-VALIDATION.smoke.json        <= mkdir -p work/export && cp work/smoke/smoke_B_XY.fbx work/export/axo-rig.fbx && cp work/smoke/skeleton-manifest.json work/export/skeleton-ma
Bash       mv        Dbg.cs.off/Dbg.cs                                  <= pkill -f run-final.sh; taskkill //F //IM testhost.exe 2>&1 | tail -1; sleep 1; mv Dbg.cs Dbg.cs.off; sed -i 's|<Compile Include="Dbg.cs" />|
Bash       mv        runs/2026-10-10-pitu-uix-03-hud-frame-and-core-readouts/evidence/report-playmode-run2-before-tolerance.txt <= python - <<'EOF' p='Assets/_Game/UI.PlayTests/HudCorePlayTests.cs' s=open(p,encoding='utf-8').read() s=s.replace(''' var b = e.worldBound; C
Bash       mv        /c/Projects/bws.game.pit-maneuver/Assets/_Game/Sim/Numerics/SimBinary.cs/SimBinary.cs <= cd /c/Projects/bws.game.pit-maneuver/Assets/_Game/Sim && mv Facade/SimBinary.cs Numerics/SimBinary.cs && sed -i 's/namespace Pit.Sim.Facade/
Bash       mv        runs/2026-10-10-pitu-inp-02-remapping/evidence/probe-editor-types.cs <= grep -n "EditMode, 8, in the gate" docs/GDD.md && sed -i 's/`Pit.Inputs.Tests.BindingProfileTests` (EditMode, 8, in the gate)/`Pit.Inputs.Te
Bash       mv        /c/Projects/bws.game.pit-maneuver/runs/2026-10-06-pitu-wld-24-hazard-set-pieces/evidence/hazard-sim-tests-final.txt <= cd /c/Projects/bws.game.pit-maneuver/runs/2026-10-06-pitu-wld-24-hazard-set-pieces/evidence && rm -f hazard-sim-tests-run1.txt hazard-sim-te
Bash       mv        /c/Projects/bws.game.tms/runs/2026-09-25-asset-manifest/clips_new/_excluded/karate_warrior_mecanim_animation_pack.csv <= cd /c/Projects/bws.game.tms/runs/2026-09-25-asset-manifest; grep -c "Human Basic Motions" manifest.csv picks/*.csv | grep -v ":0"; python - 
Bash       mv        rejected/picto_satchel_v1.png                      <= mv raw/picto_controls.png rejected/picto_controls_v1.png && mv raw/picto_satchel.png rejected/picto_satchel_v1.png && python - <<'EOF' s=ope
Bash       mv        gate2_rebind/modal_cmp.png                         <= cp gate2_rebind/*.png gate2/ 2>/dev/null; mv gate2/modal_cmp.png gate2_rebind/ 2>/dev/null; mv gate2/toast_cmp.png gate2_rebind/ 2>/dev/null
PowerShell mv        runs/2026-09-28-m1-u13-ai-cost/gate-080804-audio.log <= Move-Item runs/2026-09-28-m1-u13-ai-cost/gate.log runs/2026-09-28-m1-u13-ai-cost/gate-080804-audio.log -Force; python Tools/Harness/editor.p
Bash       mv        Builds/Android/IronCanopy-dev.prev.apk             <= mv -f Builds/Android/IronCanopy-dev.apk Builds/Android/IronCanopy-dev.prev.apk && python runs/2026-09-24-canopy-g3-mission-save/scratch/ue.p
Bash       mv        /tmp/pvr.txt                                       <= cd /c/Projects/bws.iron-canopy; du -sh runs/2026-09-22-asset-store-audit runs/2026-09-23-greybox-scene runs/2026-09-23-import-start-here; pr
Bash       mv        /c/Users/bsmi0/AppData/Local/Temp/claude/C--Projects-bws-motion-library/fc099a00-4753-4b13-bf2f-63ca18659324/scratchpad/svg-baseline.log <= mv /c/Users/bsmi0/AppData/Local/Temp/claude/C--Projects-bws-motion-library/fc099a00-4753-4b13-bf2f-63ca18659324/scratchpad/baseline.log /c/U
Bash       mv        /c/Projects/bws.portfolio/runs/2026-10-02-harness-mods/io-block.tsx.txt/dev-mods-io-block.txt <= mv C:/Users/bsmi0/.claude/dev-mods-io-block.txt /c/Projects/bws.portfolio/runs/2026-10-02-harness-mods/io-block.tsx.txt && ls /c/Projects/bw
Bash       mv        /c/Projects/bws.web.pinkgill/runs/2026-09-28-axo-canonical-natural/glb-validation-natural-variant.json <= cd /c/Projects/bws.web.pinkgill/runs/2026-09-28-axo-canonical-natural && mv axo-swim.glb axo-swim-natural-variant.glb && mv glb-validation.j
Bash       mv        C:/Projects/pil-agent-plugin/pil-agent-plugin/runs/2026-09-30-blender-inspect-u8-evals/evidence/t01-spike/attempt1-yaml-error/eval-stdout.txt <= cd C:/Projects/pil-agent-plugin/pil-agent-plugin/runs/2026-09-30-blender-inspect-u8-evals/evidence/t01-spike && mkdir -p attempt1-yaml-error
Bash       mv        /c/Projects/slop/bnd-exercise-1/runs/2026-09-14-city-rude-walker/evidence/rude_walker_nohaze.mp4 <= cd /c/Projects/slop/bnd-exercise-1/runs/2026-09-14-city-rude-walker ffprobe -v error -show_entries stream=width,height,codec_name,nb_frames,
Bash       mv        /c/Projects/street-war/Content/Synty/City/Materials/Mat_PolygonCity_skybox.uasset <= set -e cd /c/Projects/street-war # The one asset with no Synty counterpart: an orphan material nothing references. # Move the file rather th
```

## Sample: mv source (167)
```
Bash       mv source core/model/src/main/kotlin/com/bws/inkwell/core/model/Ids.kt <= git mv core/model/src/main/kotlin/com/bws/inkwell/core/model/Ids.kt core/model/src/main/kotlin/com/bws/inkwell/core/model/OpId.kt 2>/dev/nul
Bash       mv source spike/probes/3-ocr-fast-path.json                  <= VARIANT=drawings2 python spike/probe.py ocr 2 12 2>&1 | tail -12 && mv spike/probes/3-ocr-fast-path.json spike/probes/3-ocr-fast-path-drawin
Bash       mv source /c/Projects/bws.android.scribe/runs/2026-09-25-m5-c3-agents-consent/evidence/c2-flow-marks.log <= cd /c/Projects/bws.android.scribe/runs/2026-09-25-m5-c3-agents-consent && mv evidence/c2-flow-marks.log raw/ui-tap-marks.log && rm evidence/
Bash       mv source D4.md                                              <= mkdir -p briefs && mv D2.md D3.md D4.md D5.md D6.md D7.md D8.md D9.md D10.md briefs/ && ls briefs
Bash       mv source D10.md                                             <= mkdir -p briefs && mv D2.md D3.md D4.md D5.md D6.md D7.md D8.md D9.md D10.md briefs/ && ls briefs
Bash       mv source evidence/act01-1-summarize.png                     <= export ANDROID_SERIAL=47171HFH80BF5R PYTHONIOENCODING=utf-8 MSYS_NO_PATHCONV=1 && mv evidence/act01-1-summarize.png evidence/regression/ && 
Bash       mv source /c/Projects/bws.annotations/runs/2026-09-11-owner-decisions/headless-e2e.json <= mv runs/2026-09-11-owner-decisions/headless-e2e.json runs/2026-09-11-owner-decisions/headless-e2e-source-2560x1600.json && mv runs/2026-09-1
Bash       mv source /c/Projects/tmsUnreal/Plugins/Tripo3DUEBridge-UE5.8-Win64 <= cd /c/Projects/tmsUnreal && find Plugins/Tripo3DUEBridge-UE5.8-Win64 -type f | wc -l > runs/2026-09-13-character-configurations/tripo-plugin
Bash       mv source /c/Projects/bws.game.axo/runs/2026-09-29-axo-blender-model/2026-09-29-axo-ingame-character/work/anim-preview <= cd /c/Projects/bws.game.axo/runs && ls 2026-09-29-axo-blender-model/2026-09-29-axo-ingame-character/work/ && mkdir -p 2026-09-29-axo-ingame-
Bash       mv source evidence/review-run-round3.txt                     <= mv evidence/review-run-round3.txt evidence/review-run-round4.txt; cp evidence/review-run-round4.txt evidence/review-run.txt; wc -c evidence/
Bash       mv source /c/Projects/bws.game.pit-maneuver/chosen.json      <= cd /c/Projects/bws.game.pit-maneuver; R=runs/2026-10-05-pitu-ast-06-evaluate-total-music-collection; mv chosen.json $R/evidence/; cat $R/evi
Bash       mv source /c/Projects/bws.game.pit-maneuver/Assets/_Game/Sim/Facade/SimBinary.cs <= cd /c/Projects/bws.game.pit-maneuver/Assets/_Game/Sim && mv Facade/SimBinary.cs Numerics/SimBinary.cs && sed -i 's/namespace Pit.Sim.Facade/
Bash       mv source Assets/Plugins/RootMotion/RootMotion.rsp           <= mv Assets/Plugins/RootMotion/RootMotion.rsp Assets/Plugins/RootMotion/RootMotion.Runtime.rsp && ls Assets/Plugins/RootMotion/; ls Assets/Fee
Bash       mv source runs/2026-10-07-pitu-veh-08-car-model-armored-heavy/run_build.sh <= python - <<'EOF' p='tools/blender/build_civilian_set.py' s=open(p,encoding='utf-8').read() s=s.replace('S.get("deck_z0", -hl + 0.30)','-hl +
Bash       mv source /c/Projects/bws.game.tms/runs/2026-09-25-asset-manifest/clips_new/synty_boss_zombies.csv <= cd /c/Projects/bws.game.tms/runs/2026-09-25-asset-manifest; grep -c "Human Basic Motions" manifest.csv picks/*.csv | grep -v ":0"; python - 
Bash       mv source raw/picto_return_to_title.png                      <= [ -s raw/picto_return_to_title.png ] && mv raw/picto_return_to_title.png raw/picto_title.png; ls raw | grep picto_ | sed 's/picto_//; s/.png
Bash       mv source toast_cmp.png                                      <= cp gate2_rebind/*.png gate2/ 2>/dev/null; mv gate2/modal_cmp.png gate2_rebind/ 2>/dev/null; mv gate2/toast_cmp.png gate2_rebind/ 2>/dev/null
Bash       mv source /c/Projects/bws.game.tms/runs/2026-10-07-audio-pipeline/picks.jsonl <= cd /c/Projects/bws.game.tms/runs/2026-10-07-audio-pipeline && mv picks.jsonl listen-test/picks.test.jsonl && python -I - <<'EOF' import csv 
Bash       mv source Builds/Android/IronCanopy-dev.apk                  <= mv -f Builds/Android/IronCanopy-dev.apk Builds/Android/IronCanopy-dev.prev.apk && unity command eval 'UnityEditor.EditorApplication.Callback
Bash       mv source runs/2026-09-24-canopy-g3-mission-save/scratch/staging/Core/Mission/MissionState.cs <= sed -i 's/^- \[ \] T03 /- [~] T03 /' runs/2026-09-24-canopy-g3-mission-save/TASKS.md && mkdir -p Assets/IronCanopy/Core/Mission Assets/IronC
Bash       mv source runs/2026-09-26-px1-destruction/evidence/PX1-2/px05-debris-off.log <= mv runs/2026-09-26-px1-destruction/evidence/PX1-2/px05-debris-off.log runs/2026-09-26-px1-destruction/evidence/PX1-2/px05-debris-off.txt git
Bash       mv source C:/Users/bsmi0/.claude/dev-mods-io-block.txt       <= mv C:/Users/bsmi0/.claude/dev-mods-io-block.txt /c/Projects/bws.portfolio/runs/2026-10-02-harness-mods/io-block.tsx.txt && ls /c/Projects/bw
Bash       mv source /c/Projects/bws.web.pinkgill/runs/2026-09-28-axo-canonical-natural/glb-validation.json <= cd /c/Projects/bws.web.pinkgill/runs/2026-09-28-axo-canonical-natural && mv axo-swim.glb axo-swim-natural-variant.glb && mv glb-validation.j
Bash       mv source C:/Projects/pil-agent-plugin/pil-agent-plugin/runs/2026-09-30-blender-inspect-u8-evals/evidence/t01-spike/start.txt <= cd C:/Projects/pil-agent-plugin/pil-agent-plugin/runs/2026-09-30-blender-inspect-u8-evals/evidence/t01-spike && mkdir -p attempt1-yaml-error
Bash       mv source C:/Projects/pil-agent-plugin/pil-agent-plugin/runs/2026-09-30-blender-inspect-u5-depth-order/evidence/scratch/with_wire.blend <= cd C:/Projects/pil-agent-plugin/pil-agent-plugin/runs/2026-09-30-blender-inspect-u5-depth-order/evidence && mkdir -p ac-dor-01 && mv scratch
```

## Sample: cmdlet (459)
```
PowerShell cmdlet    C:\Projects\bws.android.scribe/runs\2026-10-03-m7-d6-notes\scratch\run-t02.exit <= cd C:\Projects\bws.android.scribe; .\gradlew.bat ktlintCheck detekt :core:model:test :core:data:testDebugUnitTest :core:ai:testDebugUnitTest
PowerShell cmdlet    C:\Projects\bws.annotations\runs\2026-09-10-p0-baseline\installer-receipt.txt <= pwsh -NoProfile -File C:\Projects\bws.annotations\runs\2026-09-10-p0-baseline\test-installer.ps1 2>&1 | Tee-Object C:\Projects\bws.annotatio
PowerShell cmdlet    C:\Projects\bws.game.pit-maneuver/runs\2026-10-09-pitu-gam-08-replay-recorder-and-player\evidence\editmode-replaytap.txt <= cd C:\Projects\bws.game.pit-maneuver; & tools\run-tests.ps1 -Filter Pit.Editor.Tests.ReplayTapTests 2>&1 | Tee-Object runs\2026-10-09-pitu-g
PowerShell cmdlet    C:\Projects\bws.game.pit-maneuver/runs\2026-10-07-pitu-veh-16-vehicle-lights-system\evidence\vehicle-lights-tests.txt <= cd C:\Projects\bws.game.pit-maneuver; powershell -NoProfile -ExecutionPolicy Bypass -File tools\run-tests.ps1 -Filter Pit.Editor.Tests.Vehic
PowerShell cmdlet    C:\Projects\bws.game.pit-maneuver/runs\2026-10-10-pitu-uix-13-replay-ui\evidence\playmode-replayscreenplaytests-1.txt <= cd C:\Projects\bws.game.pit-maneuver; powershell -NoProfile -ExecutionPolicy Bypass -File tools\run-tests.ps1 -Mode PlayMode -Filter Pit.UI.
PowerShell cmdlet    C:\Projects\bws.game.pit-maneuver/runs\2026-10-06-pitu-wld-16-route-c3-county-line\evidence\verify-wld16.txt <= Set-Location C:\Projects\bws.game.pit-maneuver; powershell -NoProfile -ExecutionPolicy Bypass -File tools\verify.ps1 -Tag wld16 2>&1 | Tee-O
PowerShell cmdlet    C:\Projects\bws.game.pit-maneuver/runs\2026-10-07-pitu-wld-11-route-d1-downtown\evidence\captures/..\frame-stats.txt <= cd C:\Projects\bws.game.pit-maneuver; powershell -NoProfile -ExecutionPolicy Bypass -File runs\2026-10-07-pitu-wld-11-route-d1-downtown\rebu
PowerShell cmdlet    C:\Projects\bws.game.pit-maneuver/runs\2026-10-09-pitu-spc-16-impact-feedback\evidence\impactfeedback-tests.txt <= cd C:\Projects\bws.game.pit-maneuver; $r = powershell -NoProfile -ExecutionPolicy Bypass -File tools\run-tests.ps1 -Filter Pit.Editor.Tests.
PowerShell cmdlet    C:\Projects\bws.game.pit-maneuver/runs\2026-10-06-pitu-wld-14-route-c1-county-line\evidence\frame-stats.txt <= Set-Location C:\Projects\bws.game.pit-maneuver; powershell -NoProfile -ExecutionPolicy Bypass -File runs\2026-10-06-pitu-wld-14-route-c1-cou
PowerShell cmdlet    C:\Projects\bws.game.pit-maneuver/runs\2026-10-09-pitu-par-06-sim-change-policy\verify.txt <= cd C:\Projects\bws.game.pit-maneuver; .\tools\verify.ps1 -Tag par06 2>&1 | Tee-Object -File runs\2026-10-09-pitu-par-06-sim-change-policy\ve
PowerShell cmdlet    C:\Projects\bws.game.pit-maneuver/runs\2026-10-05-pitu-wld-06-county-line-environment-kit\capture.cs <= cd C:\Projects\bws.game.pit-maneuver; Start-Sleep 20; $u="$env:LOCALAPPDATA\Unity\bin\unity.exe"; & $u command editor_status --project-path 
PowerShell cmdlet    runs/2026-09-26-m1-beats-harness/HARNESS-LOG.md    <= python Tools/M1Harness/harness.py answer U1 N3 "Approve (a); I was using it"; python Tools/M1Harness/harness.py answer U1 N4 "Commit them"; 
PowerShell cmdlet    runs/2026-09-26-blocker-closure/DECISIONS.md       <= $t = Get-Content runs/2026-09-26-blocker-closure/DECISIONS.md -Raw; $t = $t.Replace("## F01 — Enemy groups (in progress)", "## F01 — Enemy g
PowerShell cmdlet    runs/2026-09-26-m1-beats-harness/HARNESS-LOG.md    <= (Get-Content docs/design/specs/SPEC-ENEMY-GROUPS.md).Count; Select-String -Path docs/design/specs/SPEC-ENEMY-GROUPS.md -Pattern '^#{1,3} ' |
PowerShell cmdlet    runs/2026-09-26-m1-beats-harness/HARNESS-LOG.md    <= git commit -q -m @' M1 loop: queue playtest units U14-U16; M1-exit gate follows the exitGate flag (U13) Brian: path to a hands-on playable t
PowerShell cmdlet    runs/2026-09-26-m1-beats-harness/HARNESS-LOG.md    <= $os = Get-CimInstance Win32_OperatingSystem; "RAM free: {0:N1} of {1:N1} GB" -f ($os.FreePhysicalMemory/1MB), ($os.TotalVisibleMemorySize/1M
PowerShell cmdlet    runs/2026-09-26-m1-beats-harness/HARNESS-LOG.md    <= Add-Content runs/2026-09-26-m1-beats-harness/HARNESS-LOG.md "## $(Get-Date -Format 'yyyy-MM-dd HH:mm')`n- LOOP COMPLETE (exit 0) 18:06:17. U
PowerShell cmdlet    runs/2026-09-30-warden-harness/RUNLOG.md           <= $b = Start-Process python -ArgumentList 'Tools/WardenHarness/harness.py','serve' -WorkingDirectory 'C:\Projects\bws.game.tms' -WindowStyle H
PowerShell cmdlet    C:\Projects\bws.game.tms/runs\2026-09-30-warden-harness\RUNLOG.md <= cd C:\Projects\bws.game.tms; $a = 'Claude (delegated by Brian): approve the default. The re-take rule is off while a melee member holds the 
PowerShell cmdlet    runs/2026-09-26-m1-beats-harness/HARNESS-LOG.md    <= Add-Content runs/2026-09-26-m1-beats-harness/HARNESS-LOG.md "- M1 report published: https://claude.ai/artifact/VcLmKcYHEcptvXugSdiDyt (m1-re
PowerShell cmdlet    runs/2026-09-23-canopy-harness/HARNESS-LOG.md      <= Add-Content runs/2026-09-23-canopy-harness/HARNESS-LOG.md "`n## 2026-09-23 13:40`n- Brian ran /canopy-harness: 'serve up the dashboard as we
PowerShell cmdlet    runs/2026-09-23-canopy-harness/HARNESS-LOG.md      <= git add .agents/skills/canopy-harness/SKILL.md; git commit -q -m "Track the .agents mirror of the canopy-harness skill (identical to .claude
PowerShell cmdlet    runs/2026-09-24-canopy-harness-g3/HARNESS-LOG.md   <= $s="(Orchestrator decision, delegated by Brian.)"; python tools/canopy-harness/harness.py answer G3 N2 "Approve: add T14, a PM test for IC-0
PowerShell cmdlet    runs/2026-09-25-canopy-harness-g4/HARNESS-LOG.md   <= $s=Get-Content runs/2026-09-25-canopy-harness-g4/state.json -Raw | ConvertFrom-Json; $wp=$s.units.G4.workerPid; if($wp -and (Get-Process -Id
PowerShell cmdlet    C:\Projects\bws.motion.library\.claude\worktrees\agent-af6c127be7283c83c/runs/2026-09-10-polish-primitive-p-17-annotation-layer/final-react.log <= Set-Location C:\Projects\bws.motion.library\.claude\worktrees\agent-af6c127be7283c83c; $env:MOTION_DOCS_PORT='4205'; $env:MOTION_REACT_PORT=
```
