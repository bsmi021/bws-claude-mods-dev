// One multiple-choice question the model asked: its text and two to four short options.
export type Question = { text: string; options: string[] }

// What the person did with a question: picked an option, typed their own, or skipped it. null: not yet.
export type Answer = { kind: 'option' | 'other'; value: string } | { kind: 'skip' } | null

// Where an upgrade stands. reading: the questions call is out. rewrite: the rewrite call is out.
// compose: /better alone, waiting for a prompt to be typed. history: the list of past upgrades.
export type Step = 'idle' | 'compose' | 'reading' | 'questions' | 'rewrite' | 'review' | 'error' | 'history'

export type Flow = {
  step: Step
  // Bumped on every model call; a reply whose attempt no longer matches is dropped (cancel, retry, reload).
  attempt: number
  original: string
  questions: Question[]
  answers: Answer[]
  // The question whose "Other" field is open, or null.
  other: number | null
  upgraded: string
  added: string[]
  // Which call failed (error step) and a short reason.
  failed: 'questions' | 'rewrite' | null
  note: string
  // A line under the buttons after a press (Copied), or ''.
  flash: string
  // True for a review reopened from history: Cancel only closes it.
  fromHistory: boolean
}

// One saved upgrade.
export type Entry = { id: string; at: number; original: string; upgraded: string; added: string[] }

declare module 'claude-code' {
  interface PluginState {
    'bws-better': {
      flow: {
        step: 'idle' | 'compose' | 'reading' | 'questions' | 'rewrite' | 'review' | 'error' | 'history'
        attempt: number
        original: string
        questions: { text: string; options: string[] }[]
        answers: ({ kind: 'option' | 'other'; value: string } | { kind: 'skip' } | null)[]
        other: number | null
        upgraded: string
        added: string[]
        failed: 'questions' | 'rewrite' | null
        note: string
        flash: string
        fromHistory: boolean
      }
      auto: boolean
      history: { id: string; at: number; original: string; upgraded: string; added: string[] }[]
      // The one typed prompt that passes untouched after Edit put the upgrade in the box.
      armed: boolean
    }
  }
}
