# Changelog

## 0.2.1
- No behaviour change. Ships the 1.7.0 README, this CHANGELOG and the full manifest (author, homepage,
  repository, license, keywords) to installed copies: `claude plugin update` keeps files by version.
- Code comments no longer point at private development notes.

## 0.2.0
- A Skillgate tab in the bws-cockpit dashboard shows the status and the last picks, with a button that turns the gate on or off for this session.
- The cockpit action-bar chip is replaced by the tab.

## 0.1.0
- First release. With the gate on, a small model picks the skills that fit the first prompt, and the skill listing is cut to those plus any `/name` the prompt names.
- Later prompts only add picks the model has not seen, as one block beside the prompt, so the prompt cache holds.
- `/skillgate [status|on|off|explain]`.
- Fails open: on an error or no answer within 4 seconds, the full listing stays.
- Checked live in headless `claude -p`: with the gate on, the model saw only the picked skills; with it off, all of them.
