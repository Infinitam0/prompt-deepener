export type Answers = [string, string, string, string]

/** A band that is not waiting for the model. `original` is the prompt as first typed (what Restore goes back to). */
export type Settled =
  | { kind: 'idle' }
  | { kind: 'deepened'; original: string; answers: Answers; count: number; deepenedPrompt: string }

export type Band =
  | Settled
  | { kind: 'deepening'; text: string; previous: Settled }
  | { kind: 'failed'; reason: string; previous: Settled }

declare module 'claude-code' {
  interface PluginState {
    'prompt-deepener': { band: Band }
  }
}
