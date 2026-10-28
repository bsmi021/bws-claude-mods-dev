# bws-mask

Screen-share masking for recordings, demos and screen shares. `/mask` turns it on: the transcript draws emails,
phone numbers, money amounts, keys and tokens, your account name and your own terms as bars of the same length
(`▒▒▒▒`), so rows keep their length and nothing jumps. Only the screen changes: the stored conversation, and what
Claude reads, stay real.

## Use

| Command | Does |
| --- | --- |
| `/mask` | Toggle on/off. Works mid-turn. |
| `/mask on`, `/mask off` | Set it. |
| `/mask show` | Open the dashboard on the Mask tab (needs bws-cockpit). |
| `/mask text` | The mode and the counts as text. |
| `/mask --toggle` | The tab button's twin. |

While on, a status line under the prompt reads `🙈 Masking on`. The mode lasts for the session (a hot reload keeps
it; a new session starts off).

The **Mask tab** (bws-cockpit dashboard) shows the mode, how many distinct values of each kind were hidden, the rules,
what is not covered, and a Turn on / Turn off button (`m`). It never shows a hidden value or a configured term.

## What is hidden

- 📧 Email addresses (not noreply addresses), and 👤 a name written right before `<email>` (`Jane Doe <jane@…>`).
- 📞 Phone numbers: international (`+44 7700 900123`) and US (`(415) 555-0132`, `415-555-0132`).
- 💵 Money with a currency mark or code (`$4,250.00`, `€12k`, `300 USD`). `$1`…`$9` alone stays (shell arguments).
- 🔑 Keys and tokens with known prefixes (`sk-ant-…`, `ghp_…`, `github_pat_…`, `AKIA…`, `xox…`, JWTs), a `Bearer`
  value, and the value after `api_key=`, `token:`, `password:` and similar when it mixes letters and digits.
- 🏠 The account name in home paths (`C:/Users/<name>`, `/c/Users/<name>`, `/home/<name>`), and your own account
  name anywhere it appears (read from the plugin's install path).
- 🏷️ Your terms: the `terms` option, comma-separated, matched whole and in any case.

Rows covered: your prompts, Claude's replies, slash-command output, tool rows (input and output) and tool results.

Conservative on purpose: versions, token counts, dates, times, ids, URLs and file paths stay visible. Checked against
680 KB of this repo's own git log, RUNLOGs, source and READMEs: the only hits were a real commit author's name and
email.

## Not covered

- The prompt box as you type.
- Dashboard tabs and other panes (other mods draw them).
- Images and screenshots.
- No hover-to-reveal.

## Configuration

`/plugin` → bws-mask → **Terms to hide** (`terms`): names, codenames, clients, anything else, comma-separated.

## Load

```bash
claude --plugin-dir ./bws-mask
```

Installed from the `bws-mods` marketplace: `claude plugin install bws-mask@bws-mods`.

## Tested

Claude Code 2.1.311. Terminal: unit tests, hooks on a stubbed engine, live session (see the repo's run log). Desktop:
see the CHANGELOG for whether it was checked.
