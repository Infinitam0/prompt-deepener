import { describe, expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { DEFAULT_IMPROVER_TEXT } from './deepen'

const BAND = {
  plugin: 'prompt-deepener',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 100, scroll: { offset: 0, bodyRows: 19 }, view: {} },
} as const
const SURFACES = ['terminal', 'desktop'] as const

const REPLY = `<answer-1>ship the audit</answer-1>
<answer-2>raw logs</answer-2>
<answer-3>grep and awk</answer-3>
<answer-4>the customer's own numbers</answer-4>
<deepened-prompt>Audit the logs with grep, from the raw files, and check against the customer's numbers.</deepened-prompt>`

/** A prompt the person typed and sent. */
function typed(text: string) {
  return { text, wait: false, origin: { kind: 'composer' } } as const
}

type Opts = {
  draft?: string
  fork?: () => unknown
  complete?: () => unknown
  fill?: () => { isFilled: boolean; refusal?: 'no_composer' | 'dialog' }
}

/** Stands in for the engine beneath the plugin: a draft box, the model, toasts; records what the plugin did. */
function world(on: On, opts: Opts = {}) {
  const box = { text: opts.draft ?? 'fix the bug' }
  const requests: string[] = []
  const completions: string[] = []
  const toasts: string[] = []
  const fills: string[] = []
  on('prompt.read', () => ({ value: { text: box.text, cursor: box.text.length } }))
  on('prompt.fill', (_$, e) => {
    const r = opts.fill?.() ?? { isFilled: true }
    if (r.isFilled) {
      box.text = e.text
      fills.push(e.text)
    }
    return r
  })
  on('model.fork', (_$, e) => {
    requests.push(e.prompt)
    return { value: opts.fork ? opts.fork() : { isAnswered: true, text: REPLY, usage: {} } } as never
  })
  on('model.complete', (_$, e) => {
    completions.push(typeof e.prompt === 'string' ? e.prompt : '')
    return { value: opts.complete ? opts.complete() : { isAnswered: true, text: REPLY, usage: {} } } as never
  })
  on('session.model', () => ({ value: 'sonnet' }))
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.log', () => ({ value: undefined }))
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  return { box, requests, completions, toasts, fills }
}

describe('Improve', () => {
  test('replaces the draft with the deepened prompt, shows four answers, sends nothing', async ($, on) => {
    const w = world(on)
    for (const surface of SURFACES) {
      w.box.text = 'fix the bug'
      await $.prompt.submit(typed('reset'))
      const ui = await $.ui.mount({ ...BAND, surface })
      expect((await ui.find({ key: 'improve' }))?.text).toBe('Improve')
      await ui.press({ key: 'improve' })
      expect(w.box.text).toMatch(/^Audit the logs/)
      const answers = (await ui.find({ type: 'Text', text: /ship the audit/ }))?.text ?? ''
      for (const part of ['1. ship the audit', '2. raw logs', '3. grep and awk', "4. the customer's own numbers"]) expect(answers).toContain(part)
      await ui.unmount()
    }
  })

  test('the request is the improver text, the output format, then the original prompt', async ($, on) => {
    const w = world(on, { draft: 'plan my launch' })
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'improve' })
    expect(w.requests).toHaveLength(1)
    expect(w.requests[0]!.startsWith(DEFAULT_IMPROVER_TEXT)).toBe(true)
    expect(w.requests[0]!).toContain('<deepened-prompt>')
    expect(w.requests[0]!.endsWith('Original prompt:\nplan my launch')).toBe(true)
  })

  test('a changed improverText is what the request uses', { options: { improverText: 'Go deeper, please.' } }, async ($, on) => {
    const w = world(on)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'improve' })
    expect(w.requests[0]!.startsWith('Go deeper, please.')).toBe(true)
  })

  test('an empty draft does nothing', async ($, on) => {
    const w = world(on, { draft: '   ' })
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'improve' })
    expect(w.requests).toHaveLength(0)
    expect(w.toasts).toHaveLength(0)
    expect(w.box.text).toBe('   ')
  })

  test('a reply without a deepened prompt toasts the reason and leaves the draft', async ($, on) => {
    const w = world(on, { fork: () => ({ isAnswered: true, text: 'Sure, here is some chat.', usage: {} }) })
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'improve' })
    expect(w.box.text).toBe('fix the bug')
    expect(w.toasts.at(-1)).toMatch(/no deepened prompt/)
    expect(await ui.find({ type: 'Text', text: /failed:/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /ship the audit/ })).toBeUndefined()
  })

  test('a reply in the wrong shape toasts the reason and leaves the draft', async ($, on) => {
    const w = world(on, { fork: () => ({ isAnswered: true, text: '<answer-1>a</answer-1><deepened-prompt>p</deepened-prompt>', usage: {} }) })
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    await ui.press({ key: 'improve' })
    expect(w.box.text).toBe('fix the bug')
    expect(w.toasts.at(-1)).toMatch(/four answers/)
  })

  test('an API error toasts the reason and leaves the draft', async ($, on) => {
    const w = world(on, { fork: () => ({ isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: {} }) })
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'improve' })
    expect(w.box.text).toBe('fix the bug')
    expect(w.toasts.at(-1)).toMatch(/overloaded 529/)
  })

  test('nothing to fork falls back to a completion on the prompt alone, with the session model', async ($, on) => {
    const w = world(on, { fork: () => ({ isAnswered: false, reason: 'nothing-to-fork' }) })
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'improve' })
    expect(w.completions).toHaveLength(1)
    expect(w.completions[0]!.endsWith('Original prompt:\nfix the bug')).toBe(true)
    expect(w.box.text).toMatch(/^Audit the logs/)
  })

  test('a failed completion fallback toasts and leaves the draft', async ($, on) => {
    const w = world(on, {
      fork: () => ({ isAnswered: false, reason: 'nothing-to-fork' }),
      complete: () => ({ isAnswered: false, reason: 'empty-reply', usage: {} }),
    })
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'improve' })
    expect(w.box.text).toBe('fix the bug')
    expect(w.toasts.at(-1)).toMatch(/no text/)
  })

  test('sending any prompt returns the band to idle', async ($, on) => {
    world(on)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'improve' })
    expect(await ui.find({ type: 'Text', text: /ship the audit/ })).toBeDefined()
    await $.prompt.submit(typed('go'))
    expect(await ui.find({ type: 'Text', text: /ship the audit/ })).toBeUndefined()
    expect((await ui.find({ key: 'improve' }))?.text).toBe('Improve')
  })

  test('a survey keeps the band', async ($, on) => {
    world(on)
    on('ui.render', ($$, e) => {
      const { Text } = $$.ui.resolve(e)
      return <Text>others</Text>
    })
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, hasSurvey: true } })
    expect(await ui.find({ key: 'improve' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /others/ })).toBeDefined()
  })

  test('the button carries hotkey d and the borrowed chord action', async ($, on) => {
    world(on)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    const button = await ui.find({ key: 'improve' })
    expect(JSON.stringify(button)).toContain('app:diffFileListDown')
  })
})
