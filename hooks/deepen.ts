/*
 * The pure part of deepening: the request sent to the model and the parse of its reply.
 * Imports nothing, so the tests and the flow can both use it.
 */

export const DEFAULT_IMPROVER_TEXT =
  "I want a deeper version of this task, not a bigger one. Before rewriting it: (1) say what a top professional in this field would do here that I'm not asking for; (2) name the rawest material they would start from instead of what has already been digested for me; (3) name the specific methods and tools they would use; (4) say what, other than you or me, would show the result is right. Then rewrite my prompt to ask for exactly that."

/** Fixed by the mod and appended after the improver text, so a custom improver text cannot break the parse. */
export const OUTPUT_FORMAT = [
  'Reply in exactly this format and write nothing outside it. Write everything in the language of the original prompt.',
  'Each of the four answers is at most 3 lines. The deepened prompt may be as long as it needs.',
  '<answer-1>your answer to (1)</answer-1>',
  '<answer-2>your answer to (2)</answer-2>',
  '<answer-3>your answer to (3)</answer-3>',
  '<answer-4>your answer to (4)</answer-4>',
  '<deepened-prompt>the rewritten prompt, ready to send</deepened-prompt>',
  'Do not carry out the task itself.',
].join('\n')

export const MAX_ANSWER_LINES = 3

export type Answers = [string, string, string, string]

export type Parsed =
  | { isOk: true; answers: Answers; deepenedPrompt: string }
  | { isOk: false; reason: 'no-deepened-prompt' | 'wrong-shape' }

/** The improver text, then the output format, then the original prompt. */
export function buildRequest(improverText: string, originalPrompt: string): string {
  const improver = improverText.trim() === '' ? DEFAULT_IMPROVER_TEXT : improverText.trim()
  return `${improver}\n\n${OUTPUT_FORMAT}\n\nOriginal prompt:\n${originalPrompt}`
}

function tag(text: string, name: string): string | null {
  const match = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(text)
  return match === null ? null : match[1]!.trim()
}

/** Keeps the first MAX_ANSWER_LINES non-empty lines. */
export function cutLines(answer: string): string {
  return answer
    .split('\n')
    .map(line => line.trimEnd())
    .filter(line => line.trim() !== '')
    .slice(0, MAX_ANSWER_LINES)
    .join('\n')
}

export function parseReply(reply: string): Parsed {
  const deepenedPrompt = tag(reply, 'deepened-prompt')
  if (deepenedPrompt === null || deepenedPrompt === '') return { isOk: false, reason: 'no-deepened-prompt' }
  const found = [1, 2, 3, 4].map(n => tag(reply, `answer-${n}`))
  if (found.some(answer => answer === null || cutLines(answer) === '')) return { isOk: false, reason: 'wrong-shape' }
  const [a, b, c, d] = found.map(answer => cutLines(answer!))
  return { isOk: true, answers: [a!, b!, c!, d!], deepenedPrompt }
}

export function describeFailure(reason: 'no-deepened-prompt' | 'wrong-shape'): string {
  return reason === 'no-deepened-prompt' ? 'the reply had no deepened prompt' : 'the reply was not four answers and a deepened prompt'
}
