# Anthropic prompting guidance used by the rewriter (fetched 2026-10-10)

Sources:
- https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
- per-model pages: prompting-claude-opus-5-5, prompting-claude-sonnet-5-5, prompting-claude-haiku-5-5
- https://code.claude.com/docs/en/best-practices

General: be explicit (ask for above-and-beyond if wanted); give the reason behind constraints; XML tags around pasted/long material;
give a check Claude can run; name file, scope, symptom and what "fixed" means; point to existing patterns; avoid over-engineering
("only make changes that are directly requested"); no test-gaming; big/unclear features: interview or plan first; fix root causes.

Opus (4.5+/5.5): responsive to system prompt, CAPS/"CRITICAL" overtriggers; tends to over-engineer -> explicit minimal scope;
"use X when..." rather than "always/if in doubt use X"; pasted text should be wrapped in tags.
Sonnet 5.5: at low/medium may stop to check in -> "keep working until done"; adds unrequested tests/docs -> "when the asked work is done, stop and report".
Haiku 5.5: may report done without running a check -> require a real check; "keep working until everything asked is done"; state the date if searching.
No official guidance on tuning a rewriter per target model: per-family notes are our inference from the above.
