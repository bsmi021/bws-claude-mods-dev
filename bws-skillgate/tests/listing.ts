// The engine's listing as a headless run showed it (shortened): a head, a blank line, one entry per skill; claude-api
// runs over several lines, and a plugin skill's name has a colon of its own.
export const LISTING = [
  'The following skills are available for use with the Skill tool:',
  '',
  '- mods-harness: Run, resume or check the mods harness loop.',
  '- dataviz: Use this skill whenever you are about to create ANY chart.',
  '- claude-api: Reference for the Claude API.',
  'TRIGGER - read BEFORE opening the target file.',
  'SKIP only when another provider is being worked on.',
  '- pil-agent-plugin:image-analysis: Combine visual, pixel and Blender evidence.',
  '- simplify: Review the changed code for reuse, then apply the fixes.',
].join('\n')
export const NAMES = ['mods-harness', 'dataviz', 'claude-api', 'pil-agent-plugin:image-analysis', 'simplify']
