# Corpus replay: git lease detector (gitOps)

Corpus: 79355 distinct Bash/PowerShell commands (last 30 days, day-job projects excluded).
Commands the parser says take the lease: 4054. Commands a plain text search for "git <verb>" finds: 4153.
Replay time 932 ms (11.7 µs per command).

| verb | ops |
|---|---|
| add | 3113 |
| commit | 3017 |
| checkout | 436 |
| push | 356 |
| restore | 138 |
| switch | 100 |
| stash | 74 |
| rm | 73 |
| merge | 55 |
| reset | 41 |
| rebase | 41 |
| pull | 26 |
| mv | 22 |
| cherry-pick | 8 |
| am | 2 |
| revert | 1 |

commit -a / add -A-style: 1416; commits with an add before them in the same command: 2716 (of which add-all: 1241); with -C or cd: 2524; folder unknown after cd: 194.

## Text search finds "git <verb>" but the parser takes no lease: 100
Expected: the verb inside an echo, a quoted string, a commit message, a heredoc, `stash list`, `--git-dir`. Each sample was read by eye.
```
Bash       ls .git/hooks/ | grep -v sample; git status -sb | head -1; echo " ## $(date '+%Y-%m-%d %H:%M') — Brian: \"yes push the code\". git push blocked by the
Bash       echo 'Run exactly these two shell commands with the Bash tool, one at a time, and report for each whether it ran or was denied: 1) git push --dry-run 
Bash       mkdir -p /c/Projects/bws.android.scribe/runs/2026-10-02-m7-harness/briefs && cd /c/Projects/bws.android.scribe/runs/2026-10-02-m7-harness && python - 
Bash       echo 'Run these three Bash commands, one at a time, exactly as written, and report for each whether it ran or was denied. Do not retry or work around 
Bash       cat >> /c/Users/bsmi0/.claude/skills/harness-loop/reference/lessons.md <<'EOF' | **Push guard blocks the user's own pushes from day one** (Inkwell m7,
Bash       mkdir -p "$TEMP/m4smoke" && printf 'You are a smoke test. Reply with exactly: SYSPROMPT-OK\n' > "$TEMP/m4smoke/sys.md" && timeout 300 python - <<'EOF'
Bash       python - <<'EOF' import subprocess, json exe=r"C:\Users\bsmi0\.local\bin\claude.exe" r=subprocess.run([exe,"-p","--output-format","stream-json","--ver
Bash       SK=~/.agents/skills/harness-loop; SP="C:/Users/bsmi0/AppData/Local/Temp/claude/C--Projects-bws-android-scribe/c980ceda-2e88-4434-b85a-99a51f548b22/scr
Bash       git diff --stat Art/Blender/Road/Suburb/kit-manifest.json docs/SUBURB-KIT.md | tail -3; git status --short | grep -E "^ M (Art|Assets/_Content/Models)
Bash       cd /c/Projects/bws.game.pit-maneuver && python - <<'EOF' p='tools/blender/build_suburb_kit.py' s=open(p,encoding='utf-8').read() old="ang = [a0 + (2 *
Bash       python - <<'EOF' import json,pathlib # 1) loop.json fast tier -> sonnet medium p=pathlib.Path('tools/pitu-harness/loop.json'); raw=p.read_text(encodin
Bash       { cat <<'EOF' # SFX curation: Ultimate Sound FX Bundle (AUD-04, D12, GDD section 182) The game keeps only the sound files it actually plays. The rest 
Bash       R=runs/2026-10-08-pitu-veh-11-car-integration-and-tuning-interceptor && cat > $R/HANDOFF.md <<'EOF' # VEH-11 handoff: Interceptor car integration and 
Bash       R=runs/2026-10-08-pitu-veh-13-car-integration-and-tuning-pursuit-utili && rm -rf $R/scratch/dotnet/bin $R/scratch/dotnet/obj && cp runs/2026-10-08-pit
Bash       cd /c/Projects/bws.game.pit-maneuver && R=runs/2026-10-08-pitu-veh-13-car-integration-and-tuning-pursuit-utili && cp /tmp/trace.txt $R/evidence/barrie
Bash       cd /c/Projects/bws.game.pit-maneuver; python - <<'EOF' p='tools/build.ps1' s=open(p,encoding='utf-8').read() # helper functions after Bail s=s.replace
Bash       cd /c/Projects/bws.game.pit-maneuver; cat > /tmp/ins.txt <<'EOF' # A player build makes Unity rewrite settings assets (URP prefilter flags, GraphicsSe
Bash       python - <<'E' p='tools/build.ps1' s=open(p,encoding='utf-8',newline='').read() nl='\r\n' if '\r\n' in s else '\n' s=s.replace('\r\n','\n') s=s.replac
Bash       R=runs/2026-10-08-pitu-veh-10-car-integration-and-tuning-highway-cruis && python - <<'PYEOF' p='runs/2026-10-08-pitu-veh-10-car-integration-and-tuning
Bash       cat > HANDOFF.md <<'E' # PLT-09 handoff (session 1) ## State T01 and T02 done and committed (d8d4259c). T03 is blocked on Brian: CLAUDE.md is a wide p
Bash       grep -n -iE "gate|hung|watchdog|silent|wait|poll|background|sleep|timeout|haiku|fast|permission|git add|commit|dirty|clean" tools/pitu-harness/worker-
Bash       grep -n -iE "unity-label|stencil|depth|0 tests|run-play|UI Toolkit|git restore|bake_space|nested|9880|bridge|0 bytes|redirect|review-run|ScrollView|Le
Bash       cat >> "/c/Users/bsmi0/.claude/projects/C--Projects-bws-game-tms/memory/ue-crash-causes.md" <<'EOF' - **2026-10-04: a duplicate TMS editor (pid 67564,
Bash       cd /c/Projects/tms-save && E=/c/Projects/bws.game.tms/runs/2026-10-09-save-harness/evidence && python - <<'EOF' > $E/10-deny-probe.jsonl 2>$E/10-deny-
Bash       cd /c/Projects/bws.game.tms/runs/2026-10-09-save-harness && powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8776 -State Listen -ErrorA
Bash       cat >> "/c/Users/bsmi0/.claude/projects/C--Projects-bws-game-tms/memory/ue-crash-causes.md" <<'EOF' - **2026-10-07 (U-FB1 F5): MCP `GameplayTagsToolse
Bash       R=runs/2026-10-07-issue-agent && python - <<'EOF' > $R/allowlist-smoke.receipt.txt 2>&1; tail -30 $R/allowlist-smoke.receipt.txt import json, subproce
Bash       R=runs/2026-10-07-issue-agent && python - <<'EOF' > $R/allowlist-smoke.receipt.txt 2>&1; cat $R/allowlist-smoke.receipt.txt | tail -30 import json, su
Bash       cd /c/Projects/bws.game.tms/runs/2026-10-07-pr-monitor && cat > proc.sh <<'EOF' # source this, then: proc <pr> <branch> "<squash subject>" <issue> <ha
Bash       cat > /c/Users/bsmi0/AppData/Local/Temp/claude/C--Projects-bws-game-tms/5c431fa8-757e-406b-9892-ba49828b8ad9/scratchpad/run4.sh <<'EOF' source /c/Proj
Bash       echo 'Use the Bash tool to run exactly `git push --dry-run origin HEAD`, then use the Bash tool to run exactly `gh pr create --help`, then use the Pow
Bash       python - <<'PYEOF' from pathlib import Path p=Path.home()/".claude/skills/harness-loop/reference/lessons.md"; s=p.read_text(encoding="utf-8") s=s.rstr
Bash       cd /c/Projects/bws.game.tms/runs/2026-10-08-ui-system-loop && python - <<'EOF' s=open('deny_probe.py',encoding='utf-8').read() s=s.replace("1. git pus
Bash       cd /c/Projects/bws.game.tms/runs/2026-10-08-ui-system-loop && cat >> RUNLOG.md <<'EOF' ## Loop generated and proven (2026-10-08, later) - Interview: 7
Bash       python - <<'EOF' import json g=json.load(open('runs/2026-10-04-harness/192114-full/automation/index.json',encoding='utf-8-sig')) names=sorted(t['fullT
Bash       rm -rf /c/Projects/tms-items/runs/2026-10-09-items-harness/budget-probe; cat > /c/Projects/bws.game.tms/runs/2026-10-09-items-harness/RUNLOG.md <<'EOF
PowerShell Add-Content runs/2026-09-26-m1-beats-harness/HARNESS-LOG.md "## $(Get-Date -Format 'yyyy-MM-dd HH:mm')`n- Brian: 'push at the next clean pause'. Pendi
Bash       cd /c/Projects/bws.game.tms/runs/2026-10-09-kennelman-anim-pass && cat >> PLAN.md <<'EOF' ## Before Kennelman acceptance (Brian, 2026-10-09): MERGE MA
Bash       gh issue create --title "runs/2026-10-07-ui-design-system-interview is tracked in git (202 files) despite runs/ being ignored" --body "AGENTS.md: runs
Bash       cd /c/Projects/bws.game.tms/runs/2026-10-08-gh1-k2-gh1-kennelman-body && python - <<'EOF' s=open('TASKS.md',encoding='utf-8').read() s=s.replace("Stat
Bash       echo "First, try to spawn a general-purpose subagent with the Agent tool that replies pong. Second, spawn a ufb-haiku subagent (subagent_type ufb-haik
Bash       cat > runs/2026-10-07-ufb1-harness/RUNLOG.md <<'EOF' # RUNLOG: U-FB1 harness loop (2026-10-07) ## Brief Brian: build a harness loop; Opus for complex,
Bash       cat >> runs/2026-10-07-ufb1-harness/state/HARNESS-LOG.md <<'EOF' - 17:46 Brian: "Push main". `git push origin main` → 9866508..3869f45; pre-push fast 
Bash       python - <<'EOF' import json, subprocess, os cfg=json.load(open('Tools/Gh1Harness/loop.json',encoding='utf-8')) dis=cfg['worker']['backends']['claude'
Bash       taskkill //PID 62972 //F >/dev/null 2>&1; python - <<'EOF' from pathlib import Path p=Path.home()/'.claude/skills/harness-loop/reference/lessons.md'; 
Bash       python - <<'EOF' p='runs/2026-10-08-gh1-k1-gh1-restraint/TASKS.md' s=open(p,encoding='utf-8').read() s=s.replace('Status: IN_PROGRESS','Status: NEEDS_
Bash       cat > runs/2026-10-08-gh1-k1-gh1-restraint/HANDOFF.md <<'EOF' # K1 Restraint core: handoff (session 2) ## State - T01-T06 done and committed: 193e0a0 
Bash       cd /c/Projects/bws.game.tms; P=runs/2026-10-10-kennelman-harness/proof; echo 'Run exactly these two Bash commands, one at a time, and report for each 
PowerShell Add-Content runs/2026-09-26-px1-destruction/ORCHESTRATION.md "- $(Get-Date -Format 'yyyy-MM-dd HH:mm') Core full report received. Decisions: (1) Desig
Bash       python - <<'EOF' p='runs/2026-09-25-canopy-g4-harrow-bay/HANDOFF.md' s=open(p,encoding='utf-8').read() s=s.replace('''"Notes for later gates" below fi
Bash       cd /c/Projects/bws.iron-canopy; R=runs/2026-09-23-canopy-harness; echo 'Run exactly these two shell commands with the Bash tool, one at a time, and re
Bash       S=/c/Users/bsmi0/AppData/Local/Temp/claude/C--Projects-bws-mods-claude-code/193b884d-fed8-4496-b100-79070c7db795/scratchpad && R=runs/2026-10-10-sessi
Bash       S=/c/Users/bsmi0/AppData/Local/Temp/claude/C--Projects-bws-mods-claude-code/193b884d-fed8-4496-b100-79070c7db795/scratchpad && R=runs/2026-10-10-sessi
Bash       python - <<'EOF' p='hooks/board.ts' s=open(p,encoding='utf-8').read() def rep(a,b): global s assert s.count(a)==1, a s=s.replace(a,b) rep("""export ty
Bash       python - <<'EOF' p='hooks/board.ts' s=open(p,encoding='utf-8').read() def rep(a,b): global s assert s.count(a)==1, a s=s.replace(a,b) rep("""export ty
Bash       git show HEAD:bws-board/hooks/history.ts | file - ; python - <<'EOF' p='hooks/register.tsx' s=open(p,encoding='utf-8').read() def rep(a,b): global s a
Bash       python - <<'EOF' p='.claude-plugin/plugin.json' s=open(p,encoding='utf-8').read() s=s.replace('"version": "0.2.0"','"version": "0.3.0"') s=s.replace("
Bash       python - <<'PY' p=r"C:\Users\bsmi0\AppData\Local\Temp\claude\C--Projects-bws-motion-library\fc099a00-4753-4b13-bf2f-63ca18659324\scratchpad\TALLY.md" 
Bash       D=C:/Projects/bws.motion.library; S=C:/Users/bsmi0/AppData/Local/Temp/claude/C--Projects-bws-motion-library/fc099a00-4753-4b13-bf2f-63ca18659324/scrat
Bash       cd C:/Projects/bws.portfolio-fabricator && echo 'Run exactly these two shell commands, one at a time, with the Bash tool, and report for each whether 
Bash       cd C:/Projects/bws.portfolio-fabricator/runs/2026-09-30-fabricator-harness/harness && python - <<'EOF' p = "FINALIZE.md" s = open(p, encoding="utf-8")
Bash       sed -i 's|^Focused automated checks: `about.spec.ts` (both motion modes; navigation reaches `/about`)|Focused automated checks: `about.spec.ts` (axe a
Bash       python - <<'EOF' from pathlib import Path p = Path("runs/2026-09-30-games-axo-interview/TASKS.md"); t = p.read_text(encoding="utf-8") t = t.replace("-
Bash       cat > /c/Projects/bws.web.pinkgill/runs/2026-10-01-copy-interview/bisect.sh <<'EOF' #!/usr/bin/env bash # Usage: bisect.sh <commit> <grep> [throttle] 
Bash       mkdir -p docs && cat > docs/SPEC.md <<'EOF' # tickr — spec `tickr` is a local task-tracker CLI (TypeScript, Node >= 20, Vitest, ESLint). It is a test 
Bash       cd /c/Projects/harness-test/tools/tickr-harness && S="C:/Users/bsmi0/AppData/Local/Temp/claude/C--Projects-harness-test/b55c3b7f-1770-4f1f-9966-85d196
Bash       python - <<'EOF' 2>&1 | tail -20 import sys, json, subprocess, importlib.util sys.dont_write_bytecode = True spec = importlib.util.spec_from_file_loca
Bash       cat >> runs/2026-09-29-blender-plugin-harness/RUNLOG.md <<'EOF' - Phase 4 proofs (evidence/): 1. Dry cycle: run -> PAUSED exit 3 ($0.20) -> answer "bl
Bash       python - <<'EOF' import json, pathlib for f in ("runs/2026-09-29-blender-plugin-harness/loop.json", "runs/2026-09-29-blender-plugin-harness/driver/loo
Bash       gh pr checks 20 2>&1 | head; cat >> runs/2026-09-29-blender-plugin-harness/HARNESS-LOG.md <<'EOF' ## 2026-10-01 — review fixes pushed to feat/blender-
Bash       cd C:/Projects/pil-agent-plugin/pil-agent-plugin && cat > .github/workflows/release.yml <<'EOF' name: Release # Fires after a merge into main. The mar
Bash       cd C:/Projects/pil-agent-plugin/pil-agent-plugin && R=runs/2026-09-29-blender-inspect-u1-packaging/evidence && export PYTHONIOENCODING=utf-8 && { echo
Bash       cd /c/Projects/prototype.pit-manuever/runs/2026-10-03-gdd-concepts && python - <<'EOF' p='notes/asset-setup-notes.md' s=open(p,encoding='utf-8').read(
Bash       cd /c/Projects/bws.game.pit-maneuver && P=runs/2026-10-04-pitu-harness/proof && CL=/c/Users/bsmi0/.local/bin/claude.exe && export HARNESS_WORKER=1 PIT
Bash       cd /c/Projects/bws.game.pit-maneuver && cat > runs/2026-10-04-pitu-harness/RUNLOG.md <<'EOF' # RUNLOG: pitu harness (PIT MANEUVER Unity build) ## 2026
Bash       cd /c/Projects/bws.game.pit-maneuver && export PYTHONIOENCODING=utf-8 && python tools/pitu-harness/harness.py answer PLT-05 WIDE-NO "Declined by the b
PowerShell cd C:\Projects\bws.game.pit-maneuver; $env:PYTHONIOENCODING="utf-8"; python tools/pitu-harness/harness.py answer PLT-05 WIDE "Approved by the build ag
Bash       tasklist //FI "IMAGENAME eq git-remote-https.exe" | tail -1; git ls-remote --heads origin; git rev-list --reverse --first-parent main..feat/stabilize-
Bash       CLOB=$(git diff --name-only -- runs/ | grep -v '^runs/2026-09-21-w1-w7-wanted/') && echo "$CLOB" | wc -l && echo "$CLOB" && printf '%s\n' "$CLOB" | xa
Bash       cat >> runs/2026-09-21-w1-w7-wanted/clobbered-evidence.txt <<'EOF' --- 2026-09-22 gate-completion session: 31 files clobbered again and restored --- T
```

## Parser takes the lease but the text search misses: 1
```
Bash       GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never timeout 240 git -c credential.helper= -c "credential.helper=!gh auth git-credential" push -u origin feat/m
```

## Sample of lease-taking ops (7503)
```
checkout                           <= Bash       git checkout -b feat/m1-inking && mkdir -p runs/2026-09-21-m1-inking/evidence && git status --short && git rev-parse --abbrev-ref HEAD && git status -
add all                            <= Bash       python - <<'PYEOF' import io p='docs/M7-TRACKER.md' s=io.open(p,encoding='utf-8').read() s=s.replace("**Next:** D6 (Notes), with `/m7-harness`. It sta
add @/c/Projects/bws.android.scribe <= Bash       cd /c/Projects/bws.android.scribe && git add feature/editor/src/androidTest/kotlin/com/bws/inkwell/feature/editor/InkPathLatencyTest.kt runs/2026-10-0
commit [staged all]                <= Bash       git add -A && git commit -q -m "fix(m4-b2): at the cap, tell the model to answer now; a blank final answer is an error On the tablet, mode NONE alone 
add all                            <= Bash       git status --short > runs/2026-09-21-m0-inkprobe/evidence/postrun-gitstatus.txt && git add -A 2>/dev/null; git commit -q -F - <<'EOF' && git log --one
commit [staged 1]                  <= Bash       git add runs/2026-09-23-followup-inventory && git commit -q -F - <<'EOF' docs: inventory of follow-ups and deferred items after M3 Read-only sweep of 
add                                <= Bash       git status --short && git add feature/editor/src/main/kotlin/com/bws/inkwell/feature/editor/EditorToolbar.kt feature/editor/src/main/kotlin/com/bws/in
commit [staged all]                <= Bash       ./gradlew ktlintCheck detekt build test > runs/2026-09-23-m4-b1-ai-foundation/gate-t08.log 2>&1; echo EXIT=$?; grep -E 'FAIL|^e: |BUILD' runs/2026-09-
commit [staged all] @/c/Projects/bws.android.scribe <= Bash       cd /c/Projects/bws.android.scribe && python - <<'EOF' p='runs/2026-09-24-m4-b5-search/TASKS.md' s=open(p,encoding='utf-8').read() s=s.replace('- [~] T
commit [staged all]                <= Bash       git add -A && git commit -qm "runs(m5-c2): T07 regression so far: suites green, C1 ACs pass, NBK-02 A/B vs pre-C2; PLATFORM-NOTES §23 Co-Authored-By: 
add                                <= Bash       printf '\n## %s: loop COMPLETE (exit 0)\n- All D1-D10 DONE and verified. D10 17/17, gate PASS at e561303, HEAD a805363. Total ~$114. T03 accepted on s
commit [staged 1]                  <= Bash       git add feature/library/src/main/kotlin && git commit -q -F - <<'EOF' m6 E3: library in the M6 style Header on paper with a hairline rule: serif "inkw
rm @C:\Projects\bws.annotations    <= PowerShell $d = 'C:\Projects\bws.annotations\runs\2026-09-11-android-webrtc'; git -C C:\Projects\bws.annotations rm -q --cached runs/2026-09-11-android-webrtc/de
add @/c/Projects/tmsUnreal         <= Bash       cd /c/Projects/tmsUnreal && git add Source/tmsUnreal/AI/TmsNpcLogic.cpp Source/tmsUnreal/AI/TmsNpcPerceptionComponent.cpp Source/tmsUnreal/AI/TmsNpcMo
add                                <= Bash       python - <<'EOF' p='runs/2026-10-10-pitu-aud-08-adaptive-music-system/TASKS.md' s=open(p).read().replace('- [~] T01','- [x] T01') s=s.replace('- [ ] T
commit [staged all] @/c/Projects/bws.game.pit-maneuver <= Bash       cd /c/Projects/bws.game.pit-maneuver; R=runs/2026-10-05-pitu-ast-03-import-progress-bar-kit; sed -i 's/^- \[ \] T04/- [x] T04/;s/^- \[ \] T05/- [x] T0
commit [staged 1]                  <= Bash       python - <<'EOF' c=open('CLAUDE.md',encoding='utf-8',newline='').read() nl='\r\n' if '\r\n' in c else '\n' old="- After adding test files, run `tools/
commit [staged all]                <= Bash       R=runs/2026-10-06-pitu-veh-01-vehicle-art-and-damage-spec && cp /tmp/veh01-gate.txt $R/evidence/gate-output.txt && sed -i 's/^Status: IN_PROGRESS/Stat
add all                            <= Bash       R=runs/2026-10-08-pitu-dat-05-runtime-content-loading && sed -i 's/^- \[ \] T03/- [x] T03/; s/^- \[ \] T04/- [x] T04/; s/^Status: IN_PROGRESS/Status: 
add all                            <= Bash       sed -i 's/^- \[~\] T01/- [x] T01/; s/^- \[ \] T02/- [x] T02/' runs/2026-10-06-pitu-wld-03-traffic-signals/TASKS.md && git add docs/GDD.md Assets/_Cont
commit [staged 7]                  <= Bash       F=runs/2026-10-09-pitu-spc-07-impact-and-scrape-fx && sed -i 's/^- \[~\] T01/- [x] T01/; s/^- \[ \] T02/- [x] T02/; s/^- \[ \] T03/- [x] T03/; s/^- \[
commit [staged all]                <= Bash       R=runs/2026-10-07-pitu-wld-22-civilian-traffic-vehicle-set && sed -i 's/^Status: .*/Status: DONE/' $R/TASKS.md && sed -i 's#Gate: see `evidence/gate-o
add all                            <= Bash       git status --short; R=runs/2026-10-07-pitu-par-02-node-test-suite-port-to-nunit cat > $R/HANDOFF.md <<'EOF' # PAR-02 handoff: Node test suite port to 
commit                             <= Bash       R=runs/2026-10-08-pitu-tgt-10a-pursuer-ai-for-escape-chapters-part-a-ch && git rm -r -q --cached $R/scratch/dotnet/bin $R/scratch/dotnet/obj && git co
add @/c/Projects/bws.game.pit-maneuver <= Bash       cd /c/Projects/bws.game.pit-maneuver; git check-ignore -v runs | head -2; R=runs/2026-10-06-pitu-wld-05c-downtown-environment-kit-part-c-parking-; cat
add                                <= Bash       python - <<'EOF' p='docs/GDD.md' s=open(p,encoding='utf-8',newline='').read() old="hood falls from cowl 0.93 m to a 0.72 m nose, a long deck falling t
add @/c/Projects/bws.game.pit-maneuver <= Bash       cd /c/Projects/bws.game.pit-maneuver && git add docs/GDD.md docs/UI-GARAGE.md docs/UI-DESIGN-SYSTEM.md && git add -f runs/2026-10-05-pitu-uxd-05-resul
commit [staged 1] @runs/2026-10-08-pitu-gam-05-grading-engine/../.. <= Bash       git restore Assets/Settings/PC_Renderer.asset && cd runs/2026-10-08-pitu-gam-05-grading-engine && sed -i 's/^- \[ \] T04/- [x] T04/; s/^- \[ \] T05/- 
rm                                 <= Bash       R=runs/2026-10-05-pitu-wld-05b-downtown-environment-kit-part-b-neon-sig && mkdir -p Logs/review-wld05b && git mv -k $R/review-1-raw.log Logs/review-wl
add all @/c/Projects/bws.game.pit-maneuver <= Bash       cd /c/Projects/bws.game.pit-maneuver; R=runs/2026-10-06-pitu-wld-18-route-s2-suburb; python - <<'EOF' R='runs/2026-10-06-pitu-wld-18-route-s2-suburb' 
add all                            <= Bash       N=runs/2026-10-06-pitu-wld-14-route-c1-county-line && python - <<'EOF' N='runs/2026-10-06-pitu-wld-14-route-c1-county-line/' s=open(N+'TASKS.md',encod
commit [staged 1] @C:\Projects\bws.game.pit-maneuver <= PowerShell cd C:\Projects\bws.game.pit-maneuver; git add -f runs/2026-10-06-pitu-wld-20-lighting-moods/TASKS.md; git commit -q -m "WLD-20: session 5 start Co-Aut
add                                <= Bash       R=runs/2026-10-10-pitu-inp-04-steam-input-and-deck-layouts && cat > $R/HANDOFF.md <<'EOF' # INP-04 handoff (session 1) ## Status **NEEDS_USER.** T01 i
commit [staged all]                <= Bash       R=runs/2026-10-09-pitu-par-06-sim-change-policy && git add docs/GDD.md && git add -f $R/proposal/CLAUDE-sim-change-policy.md && git commit -q -m "$(ca
add                                <= Bash       git add -f runs/2026-10-07-pitu-veh-07-car-model-pursuit-utility && git commit -qm "VEH-07: run-folder review state" && cat tools/blender/build_pursui
add @/c/Projects/bws.game.pit-maneuver/runs/2026-10-09-pitu-veh-17-wheels-suspension-and-tyre-visuals/../.. <= Bash       cd /c/Projects/bws.game.pit-maneuver/runs/2026-10-09-pitu-veh-17-wheels-suspension-and-tyre-visuals && python - <<'EOF' import re t=open('TASKS.md',en
checkout                           <= Bash       git checkout -- Content/M1/Party/BP_Alrec.uasset Content/M1/Party/BP_Moca.uasset Content/M1/Input/IMC_Default.uasset && git status --short; sed -n 62,
commit [staged all]                <= Bash       python - <<'EOF' p='runs/2026-09-29-m1-u16-feel-tools/TASKS.md' s=open(p,encoding='utf-8').read() s=s.replace("- [~] T02 [BUILD]","- [x] T02 [BUILD]",
commit [staged 1]                  <= Bash       git add docs && git commit -q -F - <<'EOF' SPEC-COMPANION-AI rev 1 approved (U2 N1, keep relocation); SPEC-ACCEPT B9 captures follow-start; corner; la
commit [staged 2]                  <= Bash       D=runs/2026-09-29-m1-u16-feel-tools && cat > $D/HANDOFF.md <<'EOF' # U16 handoff: Feel tools ## State (session 1) T01 [SPEC] done as a **draft**; N1 (
add all                            <= Bash       python Tools/check_headers.py && git add -A Source Content Config Tools && git commit -q -m "U7 T02 (part A): Anselm's heal (SPEC-COMPANION-AI rev 3 §
add                                <= Bash       python - <<'EOF' p='docs/design/specs/SPEC-MOVESETS.md' s=open(p,encoding='utf-8').read() a="It holds no clip, character or slot reference, so a clip 
commit [staged 1]                  <= Bash       printf -- '- **Result (U12, 2026-09-28):** `runs/2026-09-28-harness/023310-perf` and the M1-exit gate'"'"'s `034036-perf`: 30 participants, 6/6 Engage
commit [staged 2] @/c/Projects/bws.game.tms <= Bash       cd /c/Projects/bws.game.tms && ls Content/Test/Maps/ | grep -i kennel; git add Tools/Content/build_kennelman_inspect_level.py Content/Test/Maps/L_Kenn
commit [staged all] @/c/Projects/bws.game.tms/runs/2026-09-29-warden-w1-temper/../.. <= Bash       cd /c/Projects/bws.game.tms/runs/2026-09-29-warden-w1-temper && python - <<'PYEOF' import sys; sys.path.insert(0,'.') from ed import edit edit('../../
commit [staged 2]                  <= Bash       python - <<'EOF' from pathlib import Path p=Path('runs/2026-10-07-gh1/PLAN.md'); s=p.read_text(encoding='utf-8') old='- **K-D2:** stand-in mesh is a L
add                                <= Bash       python -c " import json;r=json.load(open('runs/2026-09-27-harness/042632-fast/report.json')) print([ (t['name'],t['state']) for t in r['tests']['tests
push                               <= Bash       sed -i '25s/the 12 AST-05 signature Niagara effects/the 10 AST-05 signature Niagara effects/' docs/design/specs/SPEC-FEEDBACK.md && git diff --stat &&
checkout                           <= Bash       git checkout -- $(git status --short | grep '^ M Content/M1/Anim/' | awk '{print $2}') Content/M1/Party/BP_Alrec.uasset Content/M1/Party/BP_Anselm.uas
commit [staged 1]                  <= PowerShell git add docs; git commit -q -m "G3 prep: D-07 remove PROPOSAL geometry, D-08 + SPEC rev 0.4 gamepad menu navigation, IC-114/IC-115. Approved by Brian 
commit [staged 2]                  <= Bash       git checkout bws.iron-canopy.slnx 2>/dev/null; git add docs runs/2026-09-24-canopy-g2.5-gamepad && git commit -qm "G2.5: plan rows Done, IC-105..111/1
add all @/c/Projects/bws.iron-canopy <= Bash       cd /c/Projects/bws.iron-canopy && git checkout -- bws.iron-canopy.slnx 2>/dev/null; for f in runs/2026-09-25-canopy-g4-harrow-bay/*.png; do :; done; g
add all @/c/Projects/bws.iron-canopy <= Bash       cd /c/Projects/bws.iron-canopy/runs/2026-09-23-canopy-g1-motor-touch && python - <<'EOF' p="HANDOFF.md" s=open(p,encoding="utf-8").read() s=s.replace(
commit [staged 5]                  <= Bash       git add bws-cockpit/hooks/finish.ts bws-cockpit/tests/cockpit.test.ts bws-cockpit/tests/finish.test.ts bws-shell-lint/hooks/lint.ts runs/2026-10-10-ba
add                                <= Bash       python - <<'EOF' p='C:/Projects/bws.mods.claude-code/runs/2026-10-02-repo-sessions-pane/RUNLOG.md' s=open(p,encoding='utf-8').read() s=s.replace("""##
rm @?                              <= Bash       sed -i 's/instead of a disk scan that times out. |/instead of a disk scan that times out. `\/handoff`, which writes a HANDOFF.md for a fresh agent fro
add all @?                         <= Bash       D=C:/Projects/bws.motion.library; git -C $D add README.md docs/guide docs/index.html scripts/generate-docs-index.mjs && git -C $D commit -q -m "docs: 
commit [staged 1] @/c/Projects/bws.motion.library/.claude/worktrees/agent-a2b4b49428eb783a4 <= Bash       git -C /c/Projects/bws.motion.library/.claude/worktrees/agent-a2b4b49428eb783a4 add src/gsap.ts && git -C /c/Projects/bws.motion.library/.claude/workt
commit [staged 2]                  <= PowerShell git add src/typewriter.ts tests/unit/typewriter.spec.ts; git commit -q -m @' perf(p-14): skip redundant typewriter DOM writes and per-frame sums Frame
push @C:/Projects/bws.motion.library/.claude/worktrees/agent-aaf9862bec2f331ab <= Bash       cd "C:/Projects/bws.motion.library/.claude/worktrees/agent-aaf9862bec2f331ab" && git push -u origin polish/primitive-p-01-defocus-reveal 2>&1 | tail -
stash @C:/Projects/bws.portfolio   <= Bash       cd "C:/Projects/bws.portfolio" && git stash push -- components/ui/Card.module.css >/dev/null 2>&1 && npm run build >/dev/null 2>&1 && (netstat -ano | 
add @/c/Projects/bws.portfolio-fabricator <= Bash       cd /c/Projects/bws.portfolio-fabricator && git checkout -q feat/T-92-fabricator-webgl && git add tests/e2e/home-fabricator-laser.spec.ts && git commit
checkout @/c/Projects/bws.portfolio-t86-check <= Bash       cd /c/Projects/bws.portfolio && git commit -qam "T-86: place the About accent in flow below the content Absolute positioning on a content-sized sectio
add all @/c/Projects/bws.portfolio-fabricator <= Bash       cd /c/Projects/bws.portfolio-fabricator/runs/2026-10-01-fabricator-t-94-portrait-swarm/shots && mv t01-debug-chromium-1280-1790899459100.png t01-portr
checkout                           <= Bash       git checkout --ours tests/e2e/studio.spec.ts && for f in docs/DECISIONS.md docs/SPEC.md; do echo "===== $f"; awk '/^<<<<<<< /{p=1; print NR": <<<"} /^
push                               <= Bash       git switch -q -C main origin/main && git branch -q --set-upstream-to=origin/main main && git status -sb | head -3 && git log --oneline -1 && git branc
commit [staged all]                <= Bash       R=runs/2026-09-23-tickr-m2-store && tail -25 $R/evidence/AC-STO-04.txt | head -22 | cut -c1-160; sed -i 's/^- \[~\] T04 /- [x] T04 /' $R/TASKS.md && g
add all                            <= Bash       sed -n 10,12p README.md && git add -A && git commit -q -F - <<'EOF' release: read every environment setting by literal name (0.9.6) The directory vali
add @C:/Projects/pil-agent-plugin/pil-agent-plugin <= Bash       cd C:/Projects/pil-agent-plugin/pil-agent-plugin && sed -i 's/^- \[~\] T01 /- [x] T01 /; s/^- \[ \] T02 /- [~] T02 /' runs/2026-09-29-blender-inspect-
add @C:\Projects\bws.game.pit-maneuver <= PowerShell cd C:\Projects\bws.game.pit-maneuver; git checkout -- .gitignore; Get-Content tools/pitu-harness/status.html -TotalCount 1 | Out-Null; git add -- tool
commit [staged 2] @/c/Projects/prototype.pit-manuever/runs/2026-09-30-pitm-g5-gfx-final/../.. <= Bash       cd /c/Projects/prototype.pit-manuever/runs/2026-09-30-pitm-g5-gfx-final && mkdir -p evidence && cp C:/tmp/g5/lodmood-base.json evidence/T02-lodmood-ba
add all                            <= Bash       python - <<'EOF' p='docs/TESTING.md';s=open(p,encoding='utf-8').read() a="the far ground fades into the sky colour with no horizon band). `--out` save
add @/c/Projects/street-war        <= Bash       cd /c/Projects/street-war git add CLAUDE.md runs/2026-09-18-mixamo-vehicle-anims/RUNLOG.md echo "=== staged (must be exactly my 2 files) ===" git stat
commit [staged 1] @C:/Projects/tms-heim <= Bash       cd C:/Users/bsmi0/.claude/projects/C--Projects-tms-heim/memory; py -3 - <<'PY' p='MEMORY.md'; s=open(p,encoding='utf-8').read() line="- [Shared UE edi
add                                <= Bash       git add Source/TMS/Private/UI/TmsTechniqueClusterPaint.cpp Source/TMS/Public/UI/TmsTechniqueHudConfig.h Source/TMSTests/Private/UI/TmsTechniqueHudDash
add all                            <= Bash       git add -A Content Tools && git commit -q -m "feat(items): I6 place the container, two keepsakes and the key in L_Playtest's start hall (playtest_item
add all                            <= Bash       git add -A Content/UI Source Tools/Content && git commit -q -m "feat(ui): UI1 foundations: reflected UI types, FTmsUiGraph, UTmsUiRegistry and DA_UiRe
add                                <= Bash       grep -c "GetCurrentKeyProfile" Source/tmsUnreal/Alrec/Input/TmsInputRebindSubsystem.cpp && sed -i 's/GetCurrentKeyProfile/GetActiveKeyProfile/g' Sourc
checkout @C:/Projects/tmsUnreal    <= Bash       cd "C:/Projects/tmsUnreal" && git checkout -- Content/Heim/Maps/L_World.umap && R=runs/2026-09-07-unity-unreal-parity-implementation/receipts && cp $R
commit [staged all] @/c/Projects/harness-test <= Bash       cd /c/Users/bsmi0/.agents/skills/harness-loop; python -X utf8 - <<'EOF' p='SKILL.md'; s=open(p,encoding='utf-8').read() a=" `run --dry-run --resume`, 
```

## Read by eye (2026-10-10)

- **Text-search hits with no lease: 100.** These are `merge-base`/`merge-tree`, `stash list`/`stash show`, and verbs inside echo, grep patterns, commit messages and heredocs. All are correctly ignored.
- **Stricter check** (`corpus_misses_git.mts`): `git <verb>` at the start of a line or after `; & | (`, with heredoc bodies and here-strings cut out.
  - 10 plain commands and 4 heredoc commands are left. All 14 put the verb inside a quoted string: an `echo '... git push --dry-run ...'` prompt, a `grep -E "git add|commit"` pattern, or a harness text argument.
  - **No real git command at command position was missed.**
- **Parser hits the text search misses: 1.** `git -c credential.helper= -c "credential.helper=!gh auth git-credential" push ...` is a real push behind quoted `-c` values, so the lease is right.
- **Commands with a parsed op: 4,054 of 79,355.**
  - 2,716 commits have an `add` before them in the same command, which is the case the pre-run staged check must widen.
  - 1,241 of those are `add -A` / `add .` / `add -u`.
  - 194 ops run after a `cd` the parser cannot follow. Those are checked against the session's own folder.
