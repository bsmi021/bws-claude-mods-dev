// The permission gate for the tools that start or stop Codex work. Pure.
//
// A tool.call hook that answers without calling next(e) skips the permission system, so a write job could
// start with no prompt. The hooks call next(e) first: rules, mode, tool.check hooks and the native dialog run.
// When the call is allowed, nothing beneath answers it, and core resolves with its stub error
// "<plugin> registered the tool <name> but no tool.call hook answered this call". That text is the only
// "allowed" signal; every other answer (a deny, "you haven't granted it yet", the person's No, another
// plugin's result) is returned to the model as it is.

export const ALLOWED_STUB = 'no tool.call hook answered'

export type Gated = { deny?: string; isError?: boolean; text?: string }

export function isAllowed(r: Gated): boolean {
  return r.deny === undefined && r.isError === true && typeof r.text === 'string' && r.text.includes(ALLOWED_STUB)
}
