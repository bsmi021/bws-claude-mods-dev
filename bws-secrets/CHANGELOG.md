# Changelog

## 0.2.0
- A Secrets tab in bws-cockpit's dashboard (0.21.0 or later) lists the saved names and their placeholders, never a value. The masked entry keeps its own pane.

## 0.1.0
- First release: Claude asks for a secret with `request_secret`; you type it into a masked pane and it is saved outside the project.
- `{{secret:NAME}}` in a Bash command is filled in by the shell at run time; every Bash result is scrubbed of saved values and their common encodings, and withheld if the scrub cannot run.
- Read, Grep, Glob and Bash calls that would read the secrets folder are refused.
- `/secrets` lists saved names and `/secrets remove NAME` deletes one.
- Escape closes the entry pane and cancels the request.
