# Corpus replay: git overwrite detector (clobber)

Corpus: 79355 distinct Bash/PowerShell commands (last 30 days, day-job projects excluded).
Commands with an overwriting git op: 570. Replay time 1520 ms.

| verb, scope | ops |
|---|---|
| checkout index paths | 298 |
| restore index paths | 129 |
| checkout index all | 41 |
| stash head paths | 29 |
| checkout any all | 25 |
| checkout any paths | 20 |
| rm any paths | 19 |
| reset head all | 14 |
| rm any all | 8 |
| stash head all | 7 |
| restore index all | 3 |
| clean clean all | 2 |
| restore head paths | 1 |
| restore any paths | 1 |
| stash head all +untracked | 1 |
| stash head paths +untracked | 1 |

## A verb at a line start but no overwrite flagged, by verb (sampled)
Expected: `stash list/show/pop/apply`, `reset` without `--hard`, branch switches without `-f`, `checkout -b`, `restore --staged`, dry runs, `rm --cached`, and verbs inside quoted text.

### checkout (47)
```
Bash       git checkout -b feat/m1-inking && mkdir -p runs/2026-09-21-m1-inking/evidence && git status --short && git rev-parse --abbrev-ref HEAD && git status -
Bash       git checkout -q -b feat/m1-pen-pass && sed -n '36,60p' feature/editor/src/main/kotlin/com/bws/inkwell/feature/editor/GeometryProbe.kt && echo "=== pla
Bash       git checkout -b feat/m2-notebooks && mkdir -p runs/2026-09-22-m2-notebooks/evidence && git status > runs/2026-09-22-m2-notebooks/prerun-gitstatus.txt 
Bash       git checkout -b feat/m0-inkprobe && mkdir -p runs/2026-09-21-m0-inkprobe/evidence && git status --short --branch
Bash       git checkout -b feat/m3-polish && mkdir -p runs/2026-09-22-m3-polish/evidence && git status > runs/2026-09-22-m3-polish/prerun-gitstatus.txt && git lo
Bash       git checkout -b feat/v-latency && git add runs/2026-09-22-m3-polish/HANDOFF-V.md runs/2026-09-22-m3-polish/RUNLOG.md && git commit -q -F - <<'EOF' doc
Bash       git branch --show-current && git checkout -B m6-e5-settings feat/m6-design && git log --oneline -1 && ls feature/settings/src/main/java/com/bws/inkwel
PowerShell git checkout -B e3-library feat/m6-design; git log --oneline -1; git status --short
Bash       git checkout -q -B issue/31-rush-cache-wall-params origin/issue/31-rush-cache-wall-params && git rebase origin/main 2>&1 | tail -5; git status --short
Bash       cd /c/Projects/bws.iron-canopy; python - <<'EOF' p='docs/parity-decisions.md'; s=open(p,encoding='utf-8').read() import re i=s.index("- **One-way surf
PowerShell cd C:\Projects\bws.motion.library\.claude\worktrees\agent-a088942f2a3c155c0; git checkout -b polish/recipe-svg-decoration; npm ci 2>&1 | Select-Object
PowerShell git -C C:\Projects\bws.motion.library\.claude\worktrees\agent-a0bbc1cfde95af26b checkout -b polish/primitive-p-08-telemetry; Set-Location C:\Projects\
Bash       git checkout -b polish/primitive-p-05-count-up && git log --oneline -1 && grep -rln -i "count-up\|countUp\|P-05" src tests docs --include=*.ts --inclu
PowerShell git checkout -b polish/primitive-p-15-scroll-scene; Test-Path .codegraph; Test-Path node_modules; npm ci 2>&1 | Select-Object -Last 5
PowerShell git checkout -b polish/primitive-p-18-inertial-track; npm ci 2>&1 | Select-Object -Last 5
Bash       git checkout -b polish/primitive-p-09-sticky-cross-fade && grep -rln -i "P-09\|P09\|stickyCrossFade\|sticky-cross-fade\|crossfade\|cross-fade" src tes
Bash       git checkout -b polish/primitive-p-10-pin-scrub-track && npm ci 2>&1 | tail -5
Bash       git checkout -b polish/primitive-p-02-line-mask-reveal 2>&1 | tail -3 && ls node_modules >/dev/null 2>&1 && echo "node_modules present" || echo "node_
Bash       git branch -a --list '*recipe-ambient*'; git checkout -b polish/recipe-ambient && git branch --show-current
Bash       git checkout -b polish/primitive-p-11-unmask-from-caption && npm ci 2>&1 | tail -5
Bash       git branch -a --list '*typography*' && git ls-remote --heads origin 'polish/recipe-typography' ; git checkout -b polish/recipe-typography && git branc
Bash       cd C:/Projects/bws.motion.library/.claude/worktrees/agent-a4775d7002f75dd6e && git checkout -b polish/primitive-p-13-emphasis-cycle 2>&1 && git status
PowerShell git branch --list "polish/primitive-p-14*"; git ls-remote --heads origin "polish/primitive-p-14*"; git checkout -b polish/primitive-p-14-typewriter; n
Bash       git checkout -b polish/primitive-p-06-lagging-cursor && npm ci 2>&1 | tail -5
Bash       git checkout -b polish/primitive-p-12-draw-svg && (npm ci > /c/Users/bsmi0/AppData/Local/Temp/claude/C--Projects-bws-motion-library/fc099a00-4753-4b13
```

### reset (22)
```
Bash       cd /c/Projects/bws.android.scribe/runs/2026-09-21-m1-inking/evidence/unbuffered-experiment/reports && git reset -q ../../../.. 2>/dev/null; ls | grep 
Bash       git reset --soft HEAD~1 && git reset -q && git status --short | wc -l && echo "--- staging experiment + acceptance ---" && git add \ tools/inkprobe/sr
Bash       git reset -q runs/2026-09-23-m4-b3-ocr-transcript/scratch/gate1.log && printf '%s\n' "feat(m4-b3): recognition pipeline: lifecycle, schema, prompt, bl
Bash       git reset -q && rm -f runs/2026-09-21-m0-inkprobe/evidence/device-reports/m0-latency-fb0-pred1-hist0-screenshot-* && cat > .gitattributes <<'EOF' # Ke
Bash       cd /c/Projects/bws.android.scribe && python - <<'EOF' p='runs/2026-09-28-m6-design/DESIGN-BRIEF.md'; s=open(p,encoding='utf-8').read() s=s.replace("- 
Bash       cd /c/Projects/bws.android.scribe && python - <<'EOF' import json p='runs/2026-09-28-m6-design/m6-state.json'; d=json.load(open(p,encoding='utf-8')) d
Bash       git reset -q && git diff --stat docs/plan.md docs/spec.md && echo "=== camera-related hunks in plan/spec ===" && git diff -U0 docs/plan.md docs/spec.m
PowerShell git -C C:\Projects\bws.annotations add -A; git -C C:\Projects\bws.annotations reset -q -- apps/android; git -C C:\Projects\bws.annotations status --sh
Bash       git reset -q && git -c core.safecrlf=false add -A -- . ':!art' ':!runs/2026-09-29-axo-blender-model' ':!runs/2026-09-27-axo-multiview' > "$TEMP/axo-ad
Bash       git reset -q && git lfs status 2>/dev/null | head -3; git add art runs/2026-09-27-axo-multiview && git commit -q -F - <<'EOF' Add art library with Axo
Bash       git add -A && git diff --cached --stat | tail -1 && python -X utf8 -c " import subprocess,os fs=subprocess.run(['git','diff','--cached','--name-only']
Bash       git reset --soft d6be2d90 && git diff --cached --name-only --diff-filter=A -- runs/2026-10-04-pitu-harness | wc -l && git diff --cached --name-only --
Bash       git reset -q d6be2d90 && git status --short | grep -v "^?? runs/" | head -30; git status --short | wc -l
Bash       R=runs/2026-10-09-pitu-spc-12b-pedestrian-ai-and-sim-participation-part && git reset -q --soft HEAD~1 && git reset -q && rm -rf $R/scratch/dotnet/bin 
Bash       R=runs/2026-10-07-pitu-veh-07-car-model-pursuit-utility && python - <<'EOF' p='runs/2026-10-07-pitu-veh-07-car-model-pursuit-utility/evidence/EVIDENCE
Bash       git reset -q runs && git commit -q -m "ART-06: lightbar, streetlight and neon light rigs, real-light budget director, builder, captures, tests (GDD 66
Bash       git add -A Content Tools >/dev/null 2>&1; git reset -q; "C:/Program Files/Epic Games/UE_5.8/Engine/Binaries/Win64/UnrealEditor-Cmd.exe" C:/Projects/bw
Bash       cd /c/Projects/bws.game.tms; printf '.githooks/* text eol=lf\n*.sh text eol=lf\n' >> .gitattributes; git add --renormalize . ; git add .gitattributes;
PowerShell git add -A -- Assets/Editor.meta Assets/Editor Assets/Settings/UniversalRenderPipelineGlobalSettings.asset Assets/TutorialInfo/Icons/URP.png ProjectSe
Bash       git add -A && git commit -q -m "WIP T-89 fixes" && git fetch -q origin && git rebase --onto origin/main feat/T-88-home-scroll-performance feat/T-89-ho
Bash       cd C:/Projects/tmsUnreal; git reset -q --soft HEAD~1; git log --oneline -1; git -c core.safecrlf=false commit -q -m "Enable LiveCodingToolset and docu
Bash       git reset -q --soft HEAD~1 && git commit -q --only -F - -- docs/runbooks/task-specific-guidance.md docs/runbooks/documentation-maintenance.md .agents/
```

### stash (42)
```
Bash       grep -n "espresso" -B6 runs/2026-09-22-m2-notebooks/evidence/ac-per-03/release-runtime-classpath.txt | grep -E "^\S*[0-9]+[-:]\+---|espresso" | head -
Bash       tail -6 "C:\Users\bsmi0\AppData\Local\Temp\claude\C--Projects-bws-android-scribe\413514e6-3441-47aa-ba6b-e6b2bf2fe829\tasks\byfgssf81.output" && expor
Bash       cd /c/Projects/tmsUnreal-character-control/runs/2026-09-13-character-control && cat editor.pid; echo; for i in 01 02 03 04 05 06 07 08 09 10 11 12 13 
Bash       ls -la .codex | head; git log --oneline -1 -- .codex; git stash list | head -2
Bash       python Tools/Harness/editor.py status 2>&1 | tail -15; git diff --stat -- Content; git stash list | head; grep -rn "AttackSlots" Source --include=*.cp
Bash       grep -rn "hud-revive-prompt" Source/TMSTests | head -3; git stash list | head -2; git log --oneline -3 -- Source/TMSTests/Private/HUD 2>/dev/null | he
Bash       git diff Source/TMSTests/Private/Warden/ | head -40; git log --oneline -3; git stash list | head -3
PowerShell Get-ChildItem Content -Recurse -Filter 'SK_Anselm*' -ErrorAction SilentlyContinue | Select-Object FullName,LastWriteTime; git log --all --format='%h %
Bash       rtk proxy git status -sb | head; git rev-parse --short HEAD origin/main; git stash list | head -3; git worktree list
Bash       cd /c/Projects/tms-merge && rtk proxy git status --short --untracked-files=all | head -20; echo "untracked: $(git ls-files --others --exclude-standard
Bash       cd /c/Projects/tms-save && echo "untracked:"; git ls-files --others --exclude-standard | head -20; echo "skip-worktree:"; git ls-files -v | grep '^S' 
Bash       git fetch -q; H=$(git -C /c/Projects/tms-items rev-parse HEAD); echo "HEAD $H"; git merge-base --is-ancestor $H main && echo "IN main" || echo "NOT in
Bash       git status --short | head -20; git log --oneline -3; git stash list | head -3
Bash       git stash list | head -2; timeout 70 bash -c 'until false; do sleep 10; done' ; /tmp/ev.sh 'return UnityEditor.SessionState.GetString("ICDBG", "(none)
Bash       python -c " import json;s=json.load(open('Temp/pipeline_test_status.json',encoding='utf-8-sig'));print(s.get('summary')) for x in s.get('results',[]):
Bash       ffprobe -v error -show_entries stream=width,height -of csv=p=0 public/media/pink-gill-opening/motion-poster.png; git stash list | head -2; git status 
Bash       cd "C:/Projects/bws.portfolio" && git stash pop 2>&1 | tail -3; echo "=== STATUS ==="; git status --short; echo "=== STASH LIST ==="; git stash list
Bash       cd "C:/Projects/bws.portfolio" && git status --short components/ui/Card.module.css; git stash list | head -2; grep -c "assembly-summary" components/ui
Bash       cd "C:/Projects/bws.portfolio" && echo "=== FULL STATUS ===" && git status --short && echo "=== STASH LIST ===" && git stash list && echo "=== conflic
Bash       cd "C:/Projects/bws.portfolio" && git rev-parse stash@{0} && git stash show --stat stash@{0} 2>&1 | tail -3 && echo "=== my commit safe? ===" && git l
Bash       cd "C:/Projects/bws.portfolio" && gh pr view 89 --json number,title,state,baseRefName,headRefName,additions,deletions,changedFiles,url 2>&1; echo "===
Bash       cd "C:/Projects/bws.portfolio" && echo "=== STASH (unrelated T-21, must be intact) ===" && git stash list && git stash show --stat stash@{0} 2>&1 | ta
Bash       cd "C:/Projects/bws.portfolio" && echo "=== T-21 STASH contents ===" && git stash show --stat stash@{0} | head -20
Bash       git stash list | head -2; git show HEAD:app/globals.css > /tmp/g.css 2>/dev/null; node node_modules/prettier/bin/prettier.cjs --check /tmp/g.css 2>&1 
Bash       node node_modules/prettier/bin/prettier.cjs --check . 2>&1 | grep warn; git stash list | head -2
```

### rm (42)
```
Bash       git rm -q --cached runs/2026-09-24-m4-b9-export-integration/evidence/t01-device/fr-exa-01-appendix-empty.pdf && rm runs/2026-09-24-m4-b9-export-integr
Bash       git rm -q --cached runs/2026-09-24-m4-b6-agent-threads/evidence/b6-migration-9-10.txt; rm runs/2026-09-24-m4-b6-agent-threads/evidence/b6-migration-9-
Bash       cd /c/Projects/bws.android.scribe/runs/2026-09-24-m4-b7-quick-actions/scratch && git rm -q --cached -f patch3.py patch_agent.py patch_agent2.py fix_bs
Bash       printf '# Driver runtime state: rewritten constantly, must never dirty the tree (DONE verification requires a clean tree)\nstate.json\nstate.tmp\ndryr
Bash       git rm -q --cached runs/2026-09-23-m4-harness/dryrun-state/state.json && git commit -q -m "tools(m4): untrack dry-run state.json too Co-Authored-By: C
Bash       printf '\n# Python bytecode (M4 harness)\n__pycache__/\n' >> .gitignore && git rm -rq --cached tools/m4-harness/__pycache__ && git add -A && git commi
PowerShell git -C C:\Projects\bws.annotations rm -r -q --cached apps/android/app/.cxx; git -C C:\Projects\bws.annotations status --short | Select-String -NotMatc
PowerShell $d = 'C:\Projects\bws.annotations\runs\2026-09-11-android-webrtc'; git -C C:\Projects\bws.annotations rm -q --cached runs/2026-09-11-android-webrtc/de
Bash       git rm -q --cached Art/Blender/Fixtures/AxesFixture.blend1 && rm Art/Blender/Fixtures/AxesFixture.blend1 && printf '\n# Blender backup files\n*.blend1
Bash       cd /c/Projects/bws.game.pit-maneuver; R=runs/2026-10-06-pitu-spc-05-vehicle-fire-sim; git rm -r -q --cached $R/scratch/base/bin $R/scratch/base/obj $R
Bash       cd /c/Projects/bws.game.pit-maneuver; R=runs/2026-10-08-pitu-tgt-03-bolter; git rm -r -q --cached $R/scratch/dotnet/obj $R/scratch/dotnet/bin 2>&1 | t
Bash       cd /c/Projects/bws.game.pit-maneuver; R=runs/2026-10-08-pitu-tgt-03-bolter; git rm -r -q --cached $R/scratch/dotnet/obj $R/scratch/dotnet/bin 2>&1|tai
Bash       git rm -r -q --cached runs/2026-10-08-pitu-par-01-golden-data-and-runner-port/scratch/dotnet/bin runs/2026-10-08-pitu-par-01-golden-data-and-runner-po
Bash       D=runs/2026-10-08-pitu-par-01-golden-data-and-runner-port/scratch/dotnet && git rm -r -q --cached $D/bin $D/obj && git commit -q --amend --no-edit && 
Bash       python runs/2026-10-07-pitu-wld-22-civilian-traffic-vehicle-set/evidence/patch_chamfer.py && sed -i 's/CivHatch/CivSport/g' docs/CIVILIAN-CARS.md docs
Bash       git rm -r -q --cached runs && git commit -qm "FND-02: keep run folder untracked (runs/ is ignored) Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropi
Bash       cd /c/Projects/bws.game.pit-maneuver; D=runs/2026-10-06-pitu-veh-01-vehicle-art-and-damage-spec/scratch/dotnet; git rm -r -q --cached $D/bin $D/obj &&
Bash       cd /c/Projects/bws.game.pit-maneuver; R=runs/2026-10-06-pitu-veh-01-vehicle-art-and-damage-spec; cp $R/evidence/review-run.txt $R/evidence/review-run-
Bash       R=runs/2026-10-08-pitu-tgt-10a-pursuer-ai-for-escape-chapters-part-a-ch && git rm -r -q --cached $R/scratch/dotnet/bin $R/scratch/dotnet/obj && git co
Bash       git show --stat HEAD | grep -E "spike|exr" ; git rm -r -q --cached runs/2026-10-05-pitu-art-03-concept-art-set/spike && rm -rf runs/2026-10-05-pitu-ar
Bash       cd /c/Projects/bws.game.pit-maneuver && cp /tmp/review-run.txt runs/2026-10-06-pitu-wld-20-lighting-moods/evidence/review-run.txt && git rm -q --cache
Bash       R=runs/2026-10-09-pitu-par-03-parity-gate && git rm -r -q --cached $R/scratch/gate/bin $R/scratch/gate/obj $R/scratch/mut/bin $R/scratch/mut/obj 2>&1 
Bash       cd /c/Projects/bws.game.pit-maneuver/runs/2026-10-08-pitu-sim-10-sim-facade-snapshot-and-events/scratch/dotnet && rm -rf bin obj && cd /c/Projects/bws
Bash       git rm -r -q --cached runs/2026-10-08-pitu-par-05-determinism-and-robustness-tests/scratch/dotnet/bin runs/2026-10-08-pitu-par-05-determinism-and-robu
Bash       git rm -r -q --cached runs/2026-10-04-pitu-aud-01-audio-architecture && git commit -q -m "AUD-01: keep the run folder untracked like the other units" 
```

### switch (92)
```
Bash       cd /c/Projects/bws.android.scribe; gh pr checks 3 2>&1 | head; gh pr merge 3 --merge --delete-branch 2>&1 | tail -3; gh pr view 3 --json state,mergeCo
Bash       git switch -q feat/m4-ai 2>/dev/null; git status -sb | head -2; git log --oneline -1 origin/feat/m4-ai; git branch -vv | grep -E "feat/m4-ai|chore/m5|
Bash       git switch -c feat/m6-design && cat > runs/2026-09-28-m6-design/RUNLOG.md <<'EOF' # M6 design reset — RUNLOG ## 2026-09-28 — set-up Brian's device rev
Bash       git switch -c docs/m4-ai-spec && git status --short > runs/2026-09-23-ocr-agent-requirements/prerun-gitstatus.txt; git branch --show-current
PowerShell git switch -q -c feat/g3-mission; git branch --show-current; $p=Get-Content docs/implementation-plan.md; $p[8..21]; Select-String docs/SPEC.md -Patter
PowerShell git switch -q main; git merge --no-ff -q feat/g4-harrow-bay -m "Merge feat/g4-harrow-bay: Harrow Bay capability pass (SPEC rev 0.5, GDD v0.1, level ki
Bash       git switch -c polish/recipe-hotspots && ls node_modules 2>/dev/null | head -3; echo ---; cat docs/recipes/hotspots.html; echo ---; cat docs/recipes/ho
Bash       cd C:/Projects/bws.portfolio-fabricator && git switch --detach -q && git branch -f feat/T-91-fabricator baefce2 && git branch feat/T-92-fabricator-web
Bash       cd C:/Projects/bws.portfolio-fabricator && git push --force-with-lease=feat/T-91-fabricator:baefce2 --force-with-lease=feat/T-92-fabricator-webgl:e5a8
Bash       git switch main -q && git merge --ff-only origin/main -q && git log --oneline -1 && git switch -c feat/T-85-remove-retired-entrance && grep -rlnE "Hom
Bash       git switch -q -c feat/T-86-about-page && git branch --show-current && sed -n 151p docs/SPEC.md && sed -n 64p docs/SPEC.md && grep -n "home.about.bio\"
Bash       gh pr merge 102 --squash --subject "Raise the browser smoke job budget to 35 minutes (#102)" 2>&1 | tail -1; gh pr view 102 --json state,mergeCommit -
Bash       git switch -c feat/T-06-homepage-redesign 2>&1 | tail -1; grep -n "swimLength\s*=\|axo-swim-length" app/companion-engine.ts | head; grep -n "axo-swim-
Bash       gh pr merge 10 --squash --delete-branch --match-head-commit 4ee56e748200a1ac752ddbdab58d34db07f5c5e5 >/dev/null 2>&1; gh pr view 10 --json state,merge
Bash       git switch -q main && git merge --no-ff -q feat/tickr -m "Merge feat/tickr: tickr CLI M1-M5 + I1 (harness loop) Co-Authored-By: Claude Opus 5.5 (1M co
Bash       git switch -c fix/directory-validator-holds && \ git rm -r -q --cached runs/ && \ python - <<'EOF' import pathlib p=pathlib.Path('.gitignore'); t=p.re
Bash       git switch -q main && git pull -q && git log --oneline -1 && echo "=== non-literal env reads" && git grep -nE 'os\.environ|getenv|environ\[' -- script
Bash       cd C:/Projects/xwing/XvT; git switch -q -c chore/unreal-mcp-toolsets && git branch --show-current; python - <<'EOF' blk=open('C:/Projects/street-war/r
Bash       git switch issue/54-fetch-latch-yield-downed
Bash       git switch -c issue/62-taphold-unset-threshold
Bash       git switch -c issue/31-rush-cache-wall-params
Bash       git switch -c issue/63-dash-rim-step-clamp
Bash       git switch -c issue/8-live-coding-link-errors
Bash       git switch -c issue/98-desc-scroll-cue
Bash       git switch -c issue/33-band-path-throttle
```

### restore (5)
```
PowerShell cd C:\Projects\bws.game.pit-maneuver; git restore --staged . 2>$null; powershell -NoProfile -ExecutionPolicy Bypass -File tools\verify.ps1 -Tag tgt04 
Bash       grep -n -iE "unity-label|stencil|depth|0 tests|run-play|UI Toolkit|git restore|bake_space|nested|9880|bridge|0 bytes|redirect|review-run|ScrollView|Le
Bash       git restore --staged runs && git status --short | wc -l; git fetch -q; git log origin/main..HEAD --oneline
Bash       git restore --staged Content/NPC/Definitions/DA_Npc_severin.uasset && git commit -F - <<'EOF' Measure NPC stride calibration instead of inheriting it 
PowerShell $head = git -C C:\Projects\tmsUnreal rev-parse HEAD; "HEAD is $head"; if ($head -notlike 'b161fa57*') { "ABORT - HEAD moved, do not reset" } else { gi
```

## Sample of flagged ops (599)
```
checkout index paths         <= Bash       git checkout main 2>&1 | tail -2 && git pull --ff-only 2>&1 | tail -3 && git merge --no-ff feat/m1-inking -m "$(cat <<'EOF' Merge M1: single-page inki
rm any paths                 <= Bash       python - <<'EOF' p='core/model/src/main/kotlin/com/bws/inkwell/core/model/ai/OcrPrompt.kt' s=open(p,encoding='utf-8').read() a=s.index(' /**\n * The f
checkout index paths         <= Bash       echo "feature branch: $(git rev-parse feat/m0-inkprobe)" && echo "local merge (unpushed): $(git rev-parse main)" && echo "origin/main: $(git rev-parse
checkout index paths         <= Bash       git checkout -- runs/2026-09-28-m6-design/m6-state.json && head -c 300 runs/2026-09-28-m6-design/m6-state.json; echo; tail -c 200 runs/2026-09-28-m6-d
checkout any paths           <= PowerShell $d = 'C:\Projects\bws.annotations\runs\2026-09-11-p1-host-wiring'; Move-Item "$d\e2e.json" "$d\e2e-accepted.json" -Force; git -C C:\Projects\bws.annot
restore index paths          <= Bash       python -c " s=open('docs/GDD.md',encoding='utf-8').read() i=s.index('## 168.'); print(s[i:].count(chr(92)))"; git restore Assets/Settings/PC_Renderer.
restore index paths          <= Bash       cd /c/Projects/bws.game.pit-maneuver && git status --short | head -8; git restore Assets/Settings/PC_Renderer.asset 2>/dev/null; R=runs/2026-10-08-pit
checkout index paths         <= Bash       git checkout runs/2026-10-06-pitu-veh-01-vehicle-art-and-damage-spec/evidence/gate-output.txt && git status --short | head -3; python tools/pitu-harne
restore index paths          <= Bash       cd /c/Projects/bws.game.pit-maneuver; R=runs/2026-10-07-pitu-veh-16-vehicle-lights-system; python - <<'EOF' p='docs/GDD.md' s=open(p,encoding='utf-8',
checkout index paths         <= Bash       cd /c/Projects/bws.game.pit-maneuver && sed -i 's/dossier\.tier\.3\.name/dossier.tier_3.name/' Assets/_Game/UI.Tests/DossierTests.cs && U="$LOCALAPPDA
restore index paths          <= Bash       git restore Assets/Settings/PC_Renderer.asset && rm -rf Assets/_Content/Data/_TestTmp Assets/_Content/Data/_TestTmp.meta && sed -i 's/^- \[~\] T03/- [
rm any paths                 <= Bash       git rm -q -f runs/2026-10-09-pitu-gam-02-pursuit-chapter-rules/evidence/rules-tests.txt && sed -i 's/^- \[ \] T03/- [x] T03/; s/^- \[ \] T04/- [x] T04
restore index paths          <= Bash       R=runs/2026-10-07-pitu-wld-22-civilian-traffic-vehicle-set; E=$R/evidence; B="/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"; "$B" --bac
restore index paths          <= Bash       git restore Assets/Settings/PC_Renderer.asset && R=runs/2026-10-08-pitu-tgt-10b-pursuer-ai-for-escape-chapters-part-b-bl && sed -i 's/^- \[ \] T03 /- 
restore index paths          <= Bash       git status --short | head; git restore Assets/Settings/PC_Renderer.asset 2>/dev/null; R=runs/2026-10-08-pitu-tgt-07-hazard-user && sed -i 's/^- \[ \] 
restore index paths          <= Bash       cd /c/Projects/bws.game.pit-maneuver && git restore Assets/Settings/PC_Renderer.asset 2>&1; rm -rf Assets/Temp; git reset -q; git status --short | gre
restore index paths          <= Bash       cd C:/Projects/bws.game.pit-maneuver; python - <<'E' p='Assets/_Game/Editor.Tests/QualityTierTests.cs' s=open(p,encoding='utf-8').read() old=" var lev
restore index paths          <= PowerShell Set-Location C:\Projects\bws.game.pit-maneuver; $u="$env:LOCALAPPDATA\Unity\bin\unity.exe"; $p=(Get-Location).Path; $rf="$p\runs\2026-10-06-pitu-wld-2
restore index paths          <= Bash       git restore Assets/Settings/PC_Renderer.asset && python - <<'EOF' import re def sub(p,a,b): s=open(p,encoding='utf-8').read() assert a in s,(p,a[:40])
checkout index paths         <= Bash       cd /c/Projects/bws.game.pit-maneuver; git diff --stat ProjectSettings/ProjectSettings.asset; git diff ProjectSettings/ProjectSettings.asset | grep '^[
restore index paths          <= PowerShell Set-Location C:\Projects\bws.game.pit-maneuver; $R="runs\2026-10-09-pitu-tgt-10c-pursuer-ai-for-escape-chapters-part-c-lo"; Select-String -Path "$R\ev
checkout index paths         <= Bash       git checkout -- Assets/_Game/Editor/World/RouteI2Showcase.cs.meta && git status --short; tasklist 2>/dev/null | grep -i "sed.exe" | head -3; git grep 
restore index paths          <= Bash       git restore Assets/Settings/PC_Renderer.asset; mkdir -p runs/2026-10-09-pitu-tgt-08-tier-scaling-and-willingness/evidence; (powershell -NoProfile -Exe
restore index paths          <= Bash       git restore Assets/Settings/PC_Renderer.asset 2>/dev/null; git add Art/Blender/Pedestrians Assets/_Content Assets/_Game tools/blender/build_pedestrian
restore index paths          <= Bash       git restore Assets/Settings/PC_Renderer.asset && R=runs/2026-10-07-pitu-veh-02-vehicle-import-pipeline && python - <<'EOF' R='runs/2026-10-07-pitu-veh
restore index paths          <= Bash       R=runs/2026-10-09-pitu-plt-01-performance-budgets-and-profiling && git diff Assets/_Game/Sim > $R/sim-memo.patch && git restore Assets/_Game/Sim/Numer
restore index paths          <= Bash       git restore Assets/Settings/PC_Renderer.asset && git status --short && echo clean
restore index paths          <= Bash       git restore Assets/Settings/PC_Renderer.asset && cat >> docs/GDD.md <<'EOF' ## 107. Car model: Sport Coupe (VEH-06, 2026-10-07) Decided by the build a
checkout index paths         <= Bash       git checkout -- Source/TMSTests/Private/Playtest/TmsDungeonRangedTests.cpp && "/c/Program Files/Epic Games/UE_5.8/Engine/Build/BatchFiles/Build.bat" T
checkout index paths         <= Bash       git checkout Config/Tags/TmsFeedback.ini && cat Config/Tags/TmsFeedback.ini | head -3 && python Tools/Harness/editor.py restart --reason reflected-typ
checkout index paths         <= Bash       git checkout Source/TMS/Private/Combat/TmsHammerComponentProp.cpp Source/TMS/Private/Combat/TmsAlrecAttackComponent.cpp && git diff --stat | cat && py
reset head all               <= Bash       B="C:/Program Files/Epic Games/UE_5.8/Engine/Build/BatchFiles/Build.bat"; cd /c/Projects/tms-merge && git reset -q --hard && git fetch origin -q && gi
reset head all               <= Bash       B="C:/Program Files/Epic Games/UE_5.8/Engine/Build/BatchFiles/Build.bat"; R=/c/Projects/bws.game.tms proc(){ n=$1; br=$2; subj=$3; iss=$4; shift 4; D=
checkout index paths         <= Bash       python - <<'EOF' p='Tools/Content/build_kennelman.py' s=open(p,encoding='utf-8').read() s=s.replace('''def retarget(anims, folder, prefix):''','''def 
checkout index paths         <= Bash       grep -c "While processing prerequisites" runs/2026-10-04-harness/200939-full/editor.log; python Tools/Harness/run.py fast --no-build > runs/2026-10-04
checkout index all           <= Bash       L=runs/2026-10-05-alrec-polish; C=A_Alrec_Protector_Hit_Up_ALL_1_Root.uasset; cp Content/M1/Anim/Protector/$C $L/fixed_clips/fixed_Hit_Up_ALL_1_Root.u
rm any all                   <= Bash       K=Tools/Content/Source/Kennelman && git rm -q $K/SK_Kennelman_CapeTrim_FBX_SCALE_NONE.fbx && cp runs/2026-10-08-ai-animation/kennelman-blender/cape/tr
checkout index paths         <= Bash       cd /c/Projects/bws.game.tms; git checkout -q .mcp.json; python - <<'EOF' from pathlib import Path p = Path(".mcp.json") s = p.read_text(encoding="utf-
stash head paths             <= Bash       git add Tools/Gh1Harness .claude/skills/gh1-harness .claude/agents/gh1-haiku.md && git commit -q -F - <<'EOF' chore(harness): GH1 P4 loop (Tools/Gh1Ha
checkout index paths         <= Bash       git checkout -- Source/TMSTests/Private/Warden/TmsKitRoutePolicy.cpp && git status --short && python Tools/Harness/editor.py restart 2>&1 | tail -1 &&
checkout index paths         <= Bash       git checkout Source/TMSTests/Private/Playtest/TmsDungeonTestUtil.cpp && git status --short | head; grep -n "NoNoise" Source/TMSTests/Private/Warden/Tm
checkout index paths         <= Bash       git checkout -- bws.iron-canopy.slnx 2>/dev/null; git add -A Assets runs/2026-09-25-canopy-g4-harrow-bay && git commit -q -m "G4 T08 (G4-7): Pause -> 
checkout index paths         <= Bash       git checkout Assets/IronCanopy/Art/Materials/HarrowBay/M_HB_ForeFaded.mat && git status --short; sha256sum Builds/Android/IronCanopy-dev.apk; ls -l Bu
checkout index paths         <= Bash       python tools/unity-gate.py 2>&1 | tail -8; git checkout bws.iron-canopy.slnx 2>/dev/null; unity command eval 'var s=UnityEngine.SceneManagement.SceneM
checkout index paths         <= Bash       git checkout bws.iron-canopy.slnx 2>/dev/null; rm -f runs/2026-09-24-canopy-g2.5-gamepad/scratch/gate-t04-1.txt; sed -i 's/^- \[~\] T04 /- [x] T04 /' 
checkout index paths         <= Bash       git checkout -- bws.iron-canopy.slnx 2>/dev/null; python - <<'EOF' p='runs/2026-09-24-canopy-g3-mission-save/TASKS.md' s=open(p,encoding='utf-8').read
checkout index paths         <= Bash       cat > runs/2026-09-23-canopy-g2-combat-ai/t19-verify.log <<'EOF' T19 verification, session 4 (2026-09-24) 1. eval MarkSceneDirty(active) -> isDirty tr
checkout index paths         <= Bash       git checkout -- bws.iron-canopy.slnx 2>/dev/null; git status --short | grep -v "^??" ; python tools/unity-gate.py > runs/2026-09-25-canopy-g4-harrow-b
checkout index paths         <= Bash       python tools/unity-gate.py --ping; git checkout bws.iron-canopy.slnx; adb devices; mkdir -p runs/2026-09-24-canopy-g3-mission-save/scratch && cp runs/
checkout index paths         <= Bash       git checkout bws.iron-canopy.slnx && sed -i 's/^- \[~\] T07 /- [x] T07 /' runs/2026-09-24-canopy-g3-mission-save/TASKS.md && python - <<'PYEOF' p='run
checkout index paths         <= Bash       cd C:/Projects/bws.iron-canopy && git status --porcelain -- Assets/IronCanopy/Art/Materials/HarrowBay/M_HB_ForeFaded.mat git checkout -- Assets/IronCa
checkout any all             <= Bash       WT=/c/Users/bsmi0/AppData/Local/Temp/claude/C--Projects-bws-mods-claude-code/193b884d-fed8-4496-b100-79070c7db795/scratchpad/pub13 && git worktree add
checkout any all             <= Bash       W=/c/Users/bsmi0/AppData/Local/Temp/claude/C--Projects-bws-mods-claude-code/408c3d09-104d-4a7d-8786-3d7d6f216892/scratchpad/publish-wt && git worktree
checkout any all             <= Bash       W=/c/Users/bsmi0/AppData/Local/Temp/claude/C--Projects-bws-mods-claude-code/60b26a93-728d-4134-83e9-2bf6911580e1/scratchpad/publish-wt; git worktree a
checkout any all             <= Bash       sed -i 's/and asks for evidence when it claims done without any. |/and asks for evidence when it claims done without any. A Project Locator: a `find_p
checkout index paths         <= Bash       cd C:/Projects/bws.motion.library/.claude/worktrees/agent-a38a14509f8f056e2 && git add docs/recipes/ambient.html tests/recipes-ambient.spec.ts && git 
checkout index paths         <= Bash       git checkout main && git pull --ff-only && git log --oneline -8
stash head paths             <= Bash       cd "C:/Projects/bws.portfolio" && git stash push -- components/ui/Card.module.css >/dev/null 2>&1 && npm run build >/dev/null 2>&1 && npx playwright t
reset head all               <= Bash       cd "C:/Projects/bws.portfolio" && git reset --hard HEAD 2>&1 | tail -2 && echo "=== removing T-21 stash leftovers (none existed at session start) ==="
checkout index paths         <= Bash       cd "C:/Projects/bws.portfolio" && git checkout -q feat/T-81-projects-draw-property && git log --oneline -1 && sed -n '95,125p' tests/e2e/home-entrance
checkout index paths         <= Bash       cd "C:/Projects/bws.portfolio" && git status --short | head -2; git checkout -q main && git pull -q origin main && git log --oneline -1 && npm run bui
checkout index paths         <= Bash       cd /c/Projects/bws.portfolio-fabricator && git checkout -q feat/T-92-fabricator-webgl && git add tests/e2e/home-fabricator-laser.spec.ts && git commit
rm any paths                 <= Bash       git rm -q -r components/chapters/HomeOpening.tsx components/chapters/HomeOpening.module.css components/chapters/HomeOpeningController.tsx components/c
checkout index all           <= Bash       cd /c/Projects/bws.portfolio && git commit -qam "T-86: place the About accent in flow below the content Absolute positioning on a content-sized sectio
checkout any paths           <= Bash       git checkout a534c4d^ -- tests/e2e/__screenshots__/chromium/home-reduced-desktop-selected-work.png tests/e2e/__screenshots__/chromium/home-reduced-pho
rm any paths                 <= Bash       git rm -q tests/e2e/home-intro-header.spec.ts && npx prettier --write tests/e2e/home-fabricator-ship.spec.ts >/dev/null && npx eslint tests/e2e/home-f
checkout index paths         <= Bash       git checkout app/axo-motion.ts && git status --short && node node_modules/@playwright/test/cli.js test --project=chromium tests/e2e/axo-path.spec.ts t
checkout index all           <= PowerShell $w = "C:\Users\bsmi0\AppData\Local\Temp\claude\C--Projects-bws-web-pinkgill\32bbda40-f13e-4e69-baf1-798748a415c5\scratchpad\preview" $c = Get-NetTCPCo
checkout index all           <= PowerShell foreach ($port in 3318, 3312) { $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue; if ($c) { Stop-Process -Id $c.
checkout index all           <= Bash       git diff docs/page-structure.md | grep "^[-+]" | grep -v "^[-+][-+]" | cut -c1-120; P=/c/Users/bsmi0/AppData/Local/Temp/claude/C--Projects-bws-web-pin
checkout index paths         <= Bash       git checkout -- .gitignore && printf '\n# blender-inspect harness orchestrator (local only)\n.claude/skills/blender-inspect-harness/\n' >> .git/info/e
checkout index paths         <= Bash       gh pr merge 22 --admin --merge 2>&1; gh pr view 22 --json state,mergeCommit -q '"state=\(.state) mergeCommit=\(.mergeCommit.oid[0:7])"' && git checkou
checkout index paths         <= Bash       cd /c/Projects/bws.game.pit-maneuver && git checkout -q main && git branch --show-current && export PYTHONIOENCODING=utf-8 && P=runs/2026-10-04-pitu-h
checkout index paths         <= Bash       git checkout tests/browser/hitch.js 2>/dev/null; git status --short tests/; python - <<'PYEOF' p='tests/browser/hitch.js';s=open(p).read() def rep(a,b
stash head all               <= Bash       R=runs/2026-09-29-pitm-u1-blockers && for keep in gl art game; do others=""; for f in gl art game; do [ $f != $keep ] && others="$others js/$f.js"; do
checkout index all           <= Bash       git status --porcelain runs/ | grep -v "2026-09-21-w1-w7-wanted" | awk '{print $2}' > runs/2026-09-21-w1-w7-wanted/clobbered-evidence.txt && wc -l < r
checkout index paths         <= Bash       echo "=== restoring Lvl_ThirdPerson to HEAD ===" git checkout -- Content/ThirdPerson/Lvl_ThirdPerson.umap \ "Content/__ExternalActors__/ThirdPerson/" 
checkout index all           <= Bash       R=runs/2026-10-03-swordsman-v2-kitbash/evidence && grep "\.mat$" $R/synty-mat-reserialization-files.txt > $R/synty-mat-restored.txt && wc -l < $R/synt
stash head paths +untracked  <= Bash       cd C:/Projects/tms-save && git stash push -u -m "s5-failed-merge-debris" -- Source/TMSTests/Private/Playtest/TmsKennelmanFightVisualTest.cpp Tools/Ani
checkout index paths         <= Bash       ls -la Binaries/Win64 | grep -i "patch\|TMS" | head; git checkout Source/TMS/Private/UI/System/TmsUiWidgetStyle.cpp; git status --short
```

## Read by eye (2026-10-10)

- **Flagged:** 570 commands.
  - The largest group, `checkout index paths` (298), is mostly branch switches read as paths (`git checkout main`). That costs one `git diff --name-only`, and only when a peer claims files. A branch name matches no claimed file, so it never refuses on its own.
  - `reset head all` (14) is `reset --hard`, as meant.
  - `checkout index all` (41) comes from `git checkout -- $(git status ...)`-style lists, which really do revert every changed file.
- **Not flagged:**
  - `checkout` (47): every sample is `checkout -b/-B`.
  - `rm` (42): every sample is `rm --cached`.
  - `switch` (92): switches without `-f`.
  - `stash` (42): `list/show/pop/apply`.
  - `reset` (22): mixed or soft resets.
- **Two false-refusal patterns found and fixed:**
  - `cd "$WT" && git checkout main -- <paths>` (the publish-worktree flow; 25 `checkout any all` hits) runs in a folder the parser cannot follow. Now not judged (assumption A26).
  - `git rm -q $R/...` (8 `rm any all` hits) is a variable path. Now only files git says changed count, so a peer's committed claim does not block it.
