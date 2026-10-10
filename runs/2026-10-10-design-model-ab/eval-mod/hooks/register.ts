import type { Register } from 'claude-code'

import { GEN_SYSTEM, genPrompt } from './lib'
import { QUESTIONS } from './questions'

const OUT = 'C:/Projects/bws.mods.claude-code/runs/2026-10-10-design-model-ab/receipts/results.json'
const MODELS = ['opus', 'fable'] as const
const REPS = 2

type Row = { question: number; rep: number; model: string; ms: number; isAnswered: boolean; reason?: string; text?: string; usage?: unknown }

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'design-eval', description: 'A/B the design-picker generation prompt across models' })
    return next(e)
  })

  on('command.run', { command: 'design-eval' }, async ($, e, next) => {
    const rows: Row[] = []
    for (let q = 0; q < QUESTIONS.length; q++) {
      for (let rep = 0; rep < REPS; rep++) {
        // Both models at once per (question, rep): equal load keeps the latency comparison fair.
        const pair = await Promise.all(
          MODELS.map(async model => {
            const t0 = await $.clock.now()
            // The production request, exactly: see bws-design-picker/hooks/register.tsx.
            const r = await $.model.complete({ model, system: GEN_SYSTEM, prompt: genPrompt(QUESTIONS[q]!), maxTokens: 6000, timeoutMs: 120_000 })
            const ms = (await $.clock.now()) - t0
            const row: Row = r.isAnswered
              ? { question: q, rep, model, ms, isAnswered: true, text: r.text, usage: r.usage }
              : { question: q, rep, model, ms, isAnswered: false, reason: r.reason }
            return row
          }),
        )
        rows.push(...pair)
        await $.fs.write(OUT, JSON.stringify({ system: GEN_SYSTEM, questions: QUESTIONS, rows }, null, 2))
      }
    }
    return { text: `design-eval: ${rows.length} calls, ${rows.filter(r => r.isAnswered).length} answered -> ${OUT}` }
  })
}
