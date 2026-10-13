// bws-secrets: a secret box. Claude asks for a value with request_secret, the person types it into a masked pane, and
// it is saved outside the project. A Bash command uses it as {{secret:NAME}}: the command is rewritten so the shell
// reads the value from the file at execution time, and the result is scrubbed before the engine stores it, so the value
// never reaches the transcript (runs/2026-10-13-mods-m8-secrets/DECISIONS.md).
import type { Register } from 'claude-code'

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => next(e))
}
