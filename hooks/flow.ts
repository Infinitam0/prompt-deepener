/*
 * Deepening as the engine runs it: the side call, the draft fill and the band's state.
 * `deepen.ts` holds the pure parts.
 */
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Band, Settled } from '../types'
import { buildReplyAndStopRequest, buildRequest, describeFailure, parseReply } from './deepen'
import type { Answers } from './deepen'

export const PLUGIN = 'prompt-deepener'

export const band = atom({ plugin: 'prompt-deepener', key: 'band' } as const, { kind: 'idle' } as Band)

export type Deepening = { isOk: true; answers: Answers; deepenedPrompt: string } | { isOk: false; reason: string }

/** The band's state, for the drawing. */
export async function readBand($: EngineInterface): Promise<Band> {
  return read($, band)
}

function failure(reason: string): Deepening {
  return { isOk: false, reason }
}

/** Why a model call gave no text, in a sentence. */
function describeNoReply(r: { reason: string; status?: number | null; error?: string }): string {
  if (r.reason === 'api-error') return `the model call failed (${r.error ?? 'error'}${r.status == null ? '' : ` ${r.status}`})`
  if (r.reason === 'empty-reply') return 'the model sent no text'
  if (r.reason === 'aborted') return 'the model call was cut short'
  return `no reply (${r.reason})`
}

/**
 * Runs the original prompt through the improver text as a side call over the session's transcript;
 * with no transcript yet (a fresh session, after /clear) as a plain completion on the prompt alone.
 */
export async function deepen($: EngineInterface, improverText: string, original: string, signal?: AbortSignal): Promise<Deepening> {
  const prompt = buildRequest(improverText, original)
  const forked = await $.model.fork({ prompt })
  let text: string
  if (forked.isAnswered) {
    text = forked.text
  } else if (forked.reason === 'nothing-to-fork') {
    const completed = await $.model.complete({ model: await $.session.model(), prompt, maxTokens: 8192 }, { signal })
    if (!completed.isAnswered) return failure(describeNoReply(completed))
    text = completed.text
  } else {
    return failure(describeNoReply(forked))
  }
  const parsed = parseReply(text)
  return parsed.isOk ? parsed : failure(describeFailure(parsed.reason))
}

function settled(current: Band): Settled {
  return current.kind === 'idle' || current.kind === 'deepened' ? current : current.previous
}

const DEEPEN_TIMEOUT_MS = 90_000

/** The deepening in flight: which one counts, and the signal that stops its timer and its completion. */
const run = { id: 0, active: null as number | null, controller: null as AbortController | null }

/** Cancel: the band goes back at once and the draft is as it was; a result arriving later changes nothing. */
export async function cancel($: EngineInterface): Promise<void> {
  const current = await read($, band)
  if (current.kind !== 'deepening') return
  run.id += 1
  run.active = null
  run.controller?.abort()
  if (current.typed !== null) await $.prompt.fill({ text: current.typed, mode: 'replace' })
  await update($, band, (): Band => current.previous)
}

/** What the draft box says to a write that changes nothing: `ok`, or why it refuses (`no_composer`: threads, maybe desktop). */
export async function probeFill($: EngineInterface): Promise<'ok' | 'no_composer' | 'dialog'> {
  const box = await $.prompt.read()
  const filled = await $.prompt.fill({ text: box.text, mode: 'replace', cursor: box.cursor })
  if (filled.isFilled) return 'ok'
  return filled.refusal === 'no_composer' ? 'no_composer' : 'dialog'
}

/** Improve: deepens the draft and puts the deepened prompt in its place. Nothing is sent. */
export async function improve($: EngineInterface, improverText: string): Promise<void> {
  const draft = (await $.prompt.read()).text
  if (draft.trim() === '') return
  await startDeepening($, improverText, draft, null)
}

/**
 * Deepens `text`. `typed` is what the person typed when `++` took it out of the box: put back if the
 * deepening fails or is cancelled, so the retry is one Enter away; null when the text is still in the draft.
 */
export async function startDeepening($: EngineInterface, improverText: string, text: string, typed: string | null, isProbed = false): Promise<void> {
  // Claimed before the first await: presses return at once, so a second press must find this one running.
  if (run.active !== null) return
  const mine = ++run.id
  run.active = mine
  try {
    await deepenOnce($, improverText, text, typed, isProbed, mine)
  } catch (error) {
    // Whatever threw, the band must not stay at `deepening` and a taken-out `++` text must come back.
    const current = await read($, band)
    const previous = settled(current)
    await fail($, `unexpected error: ${String(error)}`, previous, typed)
  } finally {
    if (run.active === mine) run.active = null
  }
}

async function deepenOnce($: EngineInterface, improverText: string, text: string, typed: string | null, isProbed: boolean, mine: number): Promise<void> {
  const current = await read($, band)
  if (current.kind === 'deepening') return
  const previous = settled(current)

  // A box that takes no text (a claude.ai thread): the main model answers in the chat instead, and stops.
  if (!isProbed && (await probeFill($)) === 'no_composer') {
    await $.prompt.submit({ text: buildReplyAndStopRequest(improverText, text) })
    return
  }

  await update($, band, (): Band => ({ kind: 'deepening', text, previous, typed }))

  // `$.model.fork` takes no abort signal, so a cancelled or timed-out deepening is left to finish and its result discarded;
  // only the plain-completion fallback is really aborted.
  const controller = new AbortController()
  run.controller = controller
  const timeout = $.clock.sleep(DEEPEN_TIMEOUT_MS, { signal: controller.signal }).then(
    (): Deepening => failure(`timed out after ${DEEPEN_TIMEOUT_MS / 1000} seconds`),
    () => new Promise<never>(() => {}),
  )
  let result: Deepening
  try {
    result = await Promise.race([deepen($, improverText, text, controller.signal), timeout])
  } finally {
    controller.abort()
  }
  if (mine !== run.id) return
  if (!result.isOk) return fail($, result.reason, previous, typed)

  const original = previous.kind === 'deepened' ? previous.original : text
  const filled = await $.prompt.fill({ text: result.deepenedPrompt, mode: 'replace' })
  // A refusal that names no cause counts as a dialog: the result is kept, never lost.
  if (!filled.isFilled && filled.refusal === 'no_composer') return fail($, 'the draft box could not take the deepened prompt', previous, typed)
  if (!filled.isFilled) $.ui.toast('The draft is blocked, probably by a dialog: close it, then press Put in draft.')
  await update($, band, (): Band => ({
    kind: 'deepened',
    original,
    answers: result.answers,
    count: previous.kind === 'deepened' ? previous.count + 1 : 1,
    deepenedPrompt: result.deepenedPrompt,
    isInDraft: filled.isFilled,
  }))
}

/** Put in draft: the deepened prompt, once the dialog that held the keys is gone. */
export async function putInDraft($: EngineInterface): Promise<void> {
  const current = await read($, band)
  if (current.kind !== 'deepened' || current.isInDraft) return
  const filled = await $.prompt.fill({ text: current.deepenedPrompt, mode: 'replace' })
  if (!filled.isFilled) {
    $.ui.toast('The draft box still cannot take it: close any dialog and press Put in draft again.')
    return
  }
  await update($, band, (): Band => ({ ...current, isInDraft: true }))
}

async function fail($: EngineInterface, reason: string, previous: Settled, typed: string | null): Promise<void> {
  if (typed !== null) await $.prompt.fill({ text: typed, mode: 'replace' })
  await update($, band, (): Band => ({ kind: 'failed', reason, previous }))
  $.ui.toast(`Deepening failed: ${reason}. Your draft is unchanged.`)
}

/** Any prompt sent: the band forgets the deepening. */
export async function reset($: EngineInterface): Promise<void> {
  await update($, band, (): Band => ({ kind: 'idle' }))
}

/** Restore original: puts the prompt as first typed back in the draft and forgets the deepening. */
export async function restore($: EngineInterface): Promise<void> {
  const current = settled(await read($, band))
  if (current.kind !== 'deepened') return
  const filled = await $.prompt.fill({ text: current.original, mode: 'replace' })
  if (!filled.isFilled) {
    $.ui.toast('Could not restore the original: the draft box did not take it.')
    return
  }
  await update($, band, (): Band => ({ kind: 'idle' }))
}

/** Runs a press's work unawaited, so the press returns at once; a failure becomes a toast and never an unhandled rejection. */
export function detach($: EngineInterface, work: Promise<void>): void {
  work.catch((error: unknown) => {
    $.ui.toast(`Prompt deepener: ${String(error)}`)
  })
}
