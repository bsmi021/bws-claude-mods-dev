# Changelog

## 0.5.0
- Redesigned Side chat tab: a card per message with its markdown drawn, brighter colours and emoji, tool runs folded into one line, the answer streaming in its own card.
- No more up/down buttons: the whole chat is in the dashboard and scrolls with the wheel or the scroll keys. It follows the end only while an answer streams.
- Documents, paths and URLs a message names get chips; a click opens them in your default web browser.
- PNG pictures a message names are drawn in the chat.
- Needs bws-cockpit 0.27.0 or later.

## 0.4.4
- No behaviour change. Footer tests updated for Claude Code 2.1.307, where an engine node's `ref` is a number.

## 0.4.3
- The footer `◨ side` button is drawn in the Claude Desktop app too (it was terminal-only). There it is a click that opens the Side chat tab; the chord stays a terminal feature.

## 0.4.2
- No behaviour change. Ships the 1.7.0 README, this CHANGELOG and the full manifest (author, homepage,
  repository, license, keywords) to installed copies: `claude plugin update` keeps files by version.

## 0.4.1
- The Side chat tab keeps the keyboard: a command opens the dashboard with the cursor on the Ask box, so you can type at once, during an answer and after it.
- Needs bws-cockpit 0.21.1 or later.

## 0.4.0
- The side chat and the decision tree share one tab of bws-cockpit's dashboard (0.21.0 or later) instead of two panes. Buttons switch between the Side chat and Decision tree views.
- Every button and box has a command twin: `/side --<id> [text]`.
- Longer button labels, and the Ask box stays at the end of the tab.

## 0.3.0
- Choose the side chat's model: model buttons in the tab and `/side model [name]`. `sideModel` sets the default.
- New: `/side refresh` forks again from the main conversation as it stands now.
- New: `/side pull [question]` adds the main conversation's latest reply to the side chat.
- New: `/side send-back` and a **Send to main** button under every answer send that answer into the main conversation.
- A `main:` status shows whether the main conversation is busy, how many turns ahead it is, or that you are in sync.
- Checked live in a real interactive session.

## 0.2.1
- **Decide** is not offered while an option is still being explored, so a stray Enter cannot send it.

## 0.2.0
- New: `/explain` turns the options in the last reply into a decision tree. Explore each option in a fork, go back, see the Map, and **Decide** to send a one-paragraph decision to the main conversation.
- New options: `exploreTimeoutSeconds` and `treeDumpFile`.

## 0.1.5
- Stop asks for the keyboard back even when the pane still reports it has focus.

## 0.1.4
- Stop gives the keyboard back to the Ask box.

## 0.1.3
- The prompt footer is shared with other mods, so the `◨ side` button sits beside bws-enhance's `✦ enhance`.

## 0.1.2
- New: a `◨ side` footer button, and the `chordAction` option so a chord can open or focus the side chat.

## 0.1.1
- The pane takes keyboard focus; the transcript is drawn as a window of rows and scrolls smoothly.
- Stop really ends the child process, even while it is still thinking.

## 0.1.0
- First release: `/fork`, `/branch` and `/btw` open a copy of the conversation beside it, answered by a forked headless session. The main conversation is never touched.
- `/side` opens, continues, starts and closes the side chat.
- Checked live in Windows Terminal.
