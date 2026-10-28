# bws-codex

> Claude hands coding work to OpenAI Codex on your ChatGPT plan. Each job runs in its own git worktree and branch; Claude reviews and merges it.

Claude calls `codex_delegate` with a complete task. After Claude Code's normal permission prompt, the mod makes a git
worktree on a new branch `codex/<id>` from Claude's current commit and starts `codex exec` there in a detached process.
Codex edits files and runs commands in its sandbox but cannot commit, so the mod commits each turn on the branch. Claude
gets a job id at once and is woken with the result when the job ends, or waits for it. Claude then reviews the diff and
merges the branch itself, through its own shell, where bws-board can see it.

## Install

```sh
claude plugin marketplace add bsmi021/bws-claude-mods
claude plugin install bws-codex@bws-mods
```

Then `/reload-plugins`. Needs Claude Code 2.1.311 or later, Codex CLI 0.160.1 (`npm i -g @openai/codex`, signed in
with `codex login`), git, and Python 3 on PATH (the job supervisor uses the standard library only). Windows is the
tested platform.

## Tools Claude calls

| Tool | What it does |
| --- | --- |
| `codex_delegate {prompt, title?, effort?, network?, carry?, wait?}` | Start a job. Asks for permission first. Returns the job id, or waits up to `wait` seconds (max 540) for the result. |
| `codex_result {id, wait_s?}` | The job's state, branch, diff stat against the base, and Codex's final message. Waits up to `wait_s` seconds for a running turn. |
| `codex_status {id?, all?}` | This repository's jobs, newest first. |
| `codex_followup {id, prompt, wait?}` | The next turn on the same Codex thread, in the same worktree. Asks for permission first. |
| `codex_cancel {id, drop?}` | Stop a running turn; its edits so far are committed. `drop` also removes the worktree, archives the Codex thread and deletes the branch if it is merged. Asks for permission first. |

`codex_delegate` and `codex_result` are always in Claude's tool list; the other three load through tool search.

## What a job runs

- Worktree: `<repo-parent>/<repo>.codex-worktrees/<id>` on branch `codex/<id>`, from the commit Claude's working tree is on.
  With `carry: true`, the tree's uncommitted tracked edits become the branch's first commit; the result then tells
  Claude to stash them before merging.
- Job folder: `<git-common-dir>/bws-codex/jobs/<id>/` (never in `git status`). Codex's TEMP and TMP point at its `tmp/`.
- Codex: `codex.exe exec --json --ignore-user-config --strict-config -m <model> -s workspace-write -c approval_policy="never"`
  with the effort, `windows.sandbox="elevated"`, `shell_environment_policy.inherit="core"` and `CLAUDE.md` as an
  instruction-file fallback. Follow-ups use `exec resume <thread>` with the same flags. The native `codex.exe` is
  used, never the npm `.cmd` shim. Your `~/.codex/config.toml` is ignored for jobs, so its sandbox and MCP servers
  do not apply.
- Network: off unless the call passes `network: true`. Localhost stays reachable either way.
- Commits on the job branch run with the repository's git hooks off. The merge Claude runs uses them as usual.

## Options

Set in `/plugin` → bws-codex → configure, or `pluginConfigs` in settings.

| Option | Default | |
| --- | --- | --- |
| `model` | `gpt-6.1-sol` | The model jobs run. |
| `effort` | `medium` | Default reasoning effort: low, medium, high or xhigh. |
| `timeoutMinutes` | 30 | A turn still running after this is stopped; its edits are committed. |
| `wake` | on | Prompt an idle Claude when a turn ends (at most once per 30 s). Headless runs are never woken. |
| `codexPath` | the npm-installed `codex.exe` | Path to the native binary. |
| `pythonPath` | `python` | The Python that runs `bin/supervise.py`. |

## Tested

Claude Code 2.1.311 (headless `claude -p`) and 2.1.312 (terminal UI) on Windows 11, with Codex CLI 0.160.1 on a ChatGPT plan.
Not tested in Claude Code Desktop or VS Code.
