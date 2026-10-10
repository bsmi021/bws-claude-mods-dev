# BRIEF: agent blackboard interview

## Definition of done (from Brian's request)
PLAN.md covers the design, the feasibility findings with the API calls confirmed in the generated types, Brian's answers to the open questions, and a smallest acceptance check (for example, two sessions posting to and reading from one shared entry).

## Evidence map
| Fact | Tag | Source |
|---|---|---|
| Installed 2.1.296 = baseline | Known | receipts/claude-version.txt |
| Session Bus (cockpit 0.12.0) built, uncommitted, passing, live | Known | runs/2026-10-10-session-bus/receipts; this session got bus context mid-turn |
| `$.fs` has no append, rename, delete or lock | Known | types :3230-3354 |
| Push via `$.session.send({to:{sessionId}})`, which may start a turn in an idle peer | Known (docs), unverified live | types :2884, :8908 |
| `$.env.get` takes literal names | Known | types :3595 |
| Which mod hosts it | Unknown | |
| Board location / concurrency | Unknown (rec: config dir, file per session) | |
| Identity / role names | Unknown | |
| Claim expiry | Unknown (bus: 30 min since last edit + 90 s stale) | |
| Read/notify path, wake idle | Unknown | |
| Request lifecycle | Unknown | |
| Human view | Unknown | |

## Answers
All recorded in PLAN.md § Decisions. Every Unknown above was closed by Brian's answers on 2026-10-10.

## Follow-ups (parked)
Shelf #1-#7; PLAN.md § Follow-ups.
