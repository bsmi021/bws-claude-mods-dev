# Changelog

## 0.2.1
- No behaviour change. Ships the 1.7.0 README, this CHANGELOG and the full manifest (author, homepage,
  repository, license, keywords) to installed copies: `claude plugin update` keeps files by version.

## 0.2.0
- The Prompt Upgrade moved from a pane of its own into the Better tab of bws-cockpit's dashboard (0.21.0 or later).
- Every button and box has a command twin: `/better --<id> [text]`.
- Buttons have letter hotkeys while the dashboard has the keyboard.

## 0.1.2
- Publishes a summary chip for the bws-cockpit action bar.
- Writes one debug line when a model call fails, with no prompt text in it.

## 0.1.1
- `/better <prompt>` opens at any width; it no longer falls back to "too narrow" below 144 columns.
- A prompt taken by automatic mode is cleared from the box, so Enter cannot send the same prompt again. Cancel still puts it back.
- The flow resets if the view fails to open in automatic mode.

## 0.1.0
- First release: `/better` turns a rough prompt into a better one before it is sent.
- Up to three multiple-choice questions, then a rewrite shown side by side with your original. Nothing runs until you press Run it.
- `/better on` and `/better off` take typed prompts automatically; `/better history` reopens your last 20 upgrades.
- Checked live in Windows Terminal.
