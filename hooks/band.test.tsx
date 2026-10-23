import { describe, expect, test } from 'claude-code/testing'
import { mock } from 'claude-code/testing'
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
  const signals: AbortSignal[] = []
  on('model.fork', async (_$, e) => {
    requests.push(e.prompt)
    return { value: await (opts.fork ? opts.fork() : { isAnswered: true, text: REPLY, usage: {} }) } as never
  })
  on('model.complete', async (_$, e, next) => {
    completions.push(typeof e.prompt === 'string' ? e.prompt : '')
    signals.push(next.signal)
    return { value: await (opts.complete ? opts.complete() : { isAnswered: true, text: REPLY, usage: {} }) } as never
  })
  on('session.model', () => ({ value: 'sonnet' }))
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.log', () => ({ value: undefined }))
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  return { box, requests, completions, toasts, fills, signals }
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

describe('Restore original', () => {
  test('puts back the original prompt exactly as typed and returns the band to idle', async ($, on) => {
    const w = world(on, { draft: '  fix the bug,  please\n' })
    for (const surface of SURFACES) {
      w.box.text = '  fix the bug,  please\n'
      await $.prompt.submit(typed('reset'))
      const ui = await $.ui.mount({ ...BAND, surface })
      expect(await ui.find({ key: 'restore' })).toBeUndefined()
      await ui.press({ key: 'improve' })
      expect(w.box.text).toMatch(/^Audit the logs/)
      await ui.press({ key: 'restore' })
      expect(w.box.text).toBe('  fix the bug,  please\n')
      expect((await ui.find({ key: 'improve' }))?.text).toBe('Improve')
      expect(await ui.find({ key: 'restore' })).toBeUndefined()
      await ui.unmount()
    }
  })

  test('after a second deepening, restore goes back to the first original, and the band counts', async ($, on) => {
    const w = world(on, { draft: 'first prompt' })
    await $.prompt.submit(typed('reset'))
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'improve' })
    expect(await ui.find({ type: 'Text', text: /deepened ×1/ })).toBeDefined()
    w.box.text = `${w.box.text} Also the tests.`
    await ui.press({ key: 'improve' })
    expect(w.requests[1]!.endsWith('Also the tests.')).toBe(true)
    expect(await ui.find({ type: 'Text', text: /deepened ×2/ })).toBeDefined()
    await ui.press({ key: 'restore' })
    expect(w.box.text).toBe('first prompt')
  })

  test('a failed second deepening keeps Restore available', async ($, on) => {
    let n = 0
    const w = world(on, {
      draft: 'first prompt',
      fork: () => (n++ === 0 ? { isAnswered: true, text: REPLY, usage: {} } : { isAnswered: false, reason: 'empty-reply', usage: {} }),
    })
    await $.prompt.submit(typed('reset'))
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'improve' })
    await ui.press({ key: 'improve' })
    expect(w.toasts.at(-1)).toMatch(/Deepening failed/)
    expect(await ui.find({ key: 'restore' })).toBeDefined()
    await ui.press({ key: 'restore' })
    expect(w.box.text).toBe('first prompt')
  })

  test('after send, no Restore is offered', async ($, on) => {
    world(on)
    await $.prompt.submit(typed('reset'))
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    await ui.press({ key: 'improve' })
    expect(await ui.find({ key: 'restore' })).toBeDefined()
    await $.prompt.submit(typed('go'))
    expect(await ui.find({ key: 'restore' })).toBeUndefined()
  })
})

/** A model call the test answers when it likes. */
function held() {
  let release: (value: unknown) => void = () => {}
  const promise = new Promise(resolve => {
    release = resolve
  })
  return { promise, release }
}

describe('while deepening runs', () => {
  for (const surface of SURFACES) test(`the band shows deepening… and Cancel, not Improve; sending is refused (${surface})`, async ($, on) => {
    const gate = held()
    const w = world(on, { fork: () => gate.promise })
    mock.clock(on)
    await $.prompt.submit(typed('reset'))
    {
      const ui = await $.ui.mount({ ...BAND, surface })
      const pressed = ui.press({ key: 'improve' })
      await new Promise(resolve => setTimeout(resolve, 20))
      expect(await ui.find({ type: 'Text', text: /deepening…/ })).toBeDefined()
      expect(await ui.find({ key: 'cancel' })).toBeDefined()
      expect(await ui.find({ key: 'improve' })).toBeUndefined()
      const sent = await $.prompt.submit(typed('go on'))
      expect(sent).toMatchObject({ drop: 'Deepening in progress, Cancel first.' })
      await ui.press({ key: 'cancel' })
      gate.release({ isAnswered: true, text: REPLY, usage: {} })
      await pressed
      await ui.unmount()
    }
    expect(w.box.text).toBe('fix the bug')
  })

  test('Cancel returns at once with the draft unchanged; a result arriving later changes nothing', async ($, on) => {
    const gate = held()
    const w = world(on, { fork: () => gate.promise })
    mock.clock(on)
    await $.prompt.submit(typed('reset'))
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    const pressed = ui.press({ key: 'improve' })
    await new Promise(resolve => setTimeout(resolve, 20))
    await ui.press({ key: 'cancel' })
    expect((await ui.find({ key: 'improve' }))?.text).toBe('Improve')
    expect(w.box.text).toBe('fix the bug')
    gate.release({ isAnswered: true, text: REPLY, usage: {} })
    await pressed
    expect(w.box.text).toBe('fix the bug')
    expect(await ui.find({ type: 'Text', text: /ship the audit/ })).toBeUndefined()
    expect(w.toasts).toHaveLength(0)
    const sent = await $.prompt.submit(typed('now it sends'))
    expect(sent).toMatchObject({ text: 'now it sends' })
  })

  test('Cancel aborts the plain-completion fallback for real', async ($, on) => {
    const gate = held()
    const w = world(on, { fork: () => ({ isAnswered: false, reason: 'nothing-to-fork' }), complete: () => gate.promise })
    mock.clock(on)
    await $.prompt.submit(typed('reset'))
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    const pressed = ui.press({ key: 'improve' })
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(w.signals[0]?.aborted).toBe(false)
    await ui.press({ key: 'cancel' })
    expect(w.signals[0]?.aborted).toBe(true)
    gate.release({ isAnswered: true, text: REPLY, usage: {} })
    await pressed
    expect(w.box.text).toBe('fix the bug')
  })

  for (const surface of SURFACES) test(`after 90 seconds: toast timed out, draft unchanged, late result discarded (${surface})`, async ($, on) => {
    {
      const gate = held()
      const w = world(on, { fork: () => gate.promise })
      const clock = mock.clock(on)
      await $.prompt.submit(typed('reset'))
      const ui = await $.ui.mount({ ...BAND, surface })
      const pressed = ui.press({ key: 'improve' })
      await new Promise(resolve => setTimeout(resolve, 20))
      await clock.advance(89_000)
      expect(w.toasts).toHaveLength(0)
      await clock.advance(1_000)
      await pressed
      expect(w.toasts.at(-1)).toMatch(/timed out after 90 seconds/)
      expect(w.box.text).toBe('fix the bug')
      gate.release({ isAnswered: true, text: REPLY, usage: {} })
      await new Promise(resolve => setTimeout(resolve, 20))
      expect(w.box.text).toBe('fix the bug')
      expect(await ui.find({ type: 'Text', text: /ship the audit/ })).toBeUndefined()
      await ui.unmount()
    }
  })
})

const settle = () => new Promise(resolve => setTimeout(resolve, 25))

describe('the ++ marker', () => {
  test('++ text from the person is dropped, the text is deepened, the deepened prompt fills the draft', async ($, on) => {
    const w = world(on, { draft: '' })
    const sent = await $.prompt.submit(typed('++ plan my launch'))
    expect(sent).toMatchObject({ drop: expect.any(String) })
    await settle()
    expect(w.requests).toHaveLength(1)
    expect(w.requests[0]!.endsWith('Original prompt:\nplan my launch')).toBe(true)
    expect(w.requests[0]!).not.toContain('++')
    expect(w.box.text).toMatch(/^Audit the logs/)
    expect(w.box.text).not.toContain('++')
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ key: 'restore' })).toBeDefined()
  })

  test('++ with no space and with several lines is read the same way', async ($, on) => {
    const w = world(on, { draft: '' })
    await $.prompt.submit(typed('++plan\nmy launch'))
    await settle()
    expect(w.requests[0]!.endsWith('Original prompt:\nplan\nmy launch')).toBe(true)
  })

  test('a failed ++ deepening puts what was typed back in the draft and toasts', async ($, on) => {
    const w = world(on, { draft: '', fork: () => ({ isAnswered: false, reason: 'empty-reply', usage: {} }) })
    await $.prompt.submit(typed('++ plan my launch'))
    await settle()
    expect(w.box.text).toBe('++ plan my launch')
    expect(w.toasts.at(-1)).toMatch(/Deepening failed/)
  })

  test('Cancel on a ++ deepening puts what was typed back', async ($, on) => {
    const gate = held()
    const w = world(on, { draft: '', fork: () => gate.promise })
    mock.clock(on)
    await $.prompt.submit(typed('++ plan my launch'))
    await settle()
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'cancel' })
    expect(w.box.text).toBe('++ plan my launch')
    gate.release({ isAnswered: true, text: REPLY, usage: {} })
    await settle()
    expect(w.box.text).toBe('++ plan my launch')
  })

  const PASSES: [string, Record<string, unknown>][] = [
    ['a slash command', { text: '++ x', command: { name: 'review', args: '++ x' } }],
    ['an isMeta prompt', { text: '++ x', isMeta: true }],
    ['a peer', { text: '++ x', origin: { kind: 'peer' } }],
    ['a plugin', { text: '++ x', origin: { kind: 'plugin', plugin: 'other' } }],
    ['a notification', { text: '++ x', origin: { kind: 'task-notification' } }],
    ['++ with nothing after it', { text: '++' }],
    ['++ with only spaces after it', { text: '++   ' }],
    ['++ in the middle', { text: 'a ++ b' }],
    ['++ at the end', { text: 'do it ++' }],
    ['a single +', { text: '+ plan' }],
  ]
  for (const [name, input] of PASSES) {
    test(`passes through unchanged: ${name}`, async ($, on) => {
      const w = world(on)
      const sent = await $.prompt.submit({ ...typed('x'), ...input } as never)
      await settle()
      expect(sent).toMatchObject({ text: input.text })
      expect(w.requests).toHaveLength(0)
      expect(w.completions).toHaveLength(0)
    })
  }
})

// The `no_composer` refusal cannot be staged here: the test kit strips a cause a hook writes itself, as the engine does.
// That branch is proven for real, in a headless session where no box exists, by e2e/fallback.e2e.sh.
describe('when the draft box cannot be filled', () => {
  test('on a refusal that names no cause: a toast says to close it, the band keeps the result and offers Put in draft, which fills it later', async ($, on) => {
    let isDialogUp = true
    const w = world(on, { fill: () => (isDialogUp ? { isFilled: false, refusal: 'dialog' } : { isFilled: true }) })
    for (const surface of SURFACES) {
      isDialogUp = true
      w.box.text = 'fix the bug'
      await $.prompt.submit(typed('reset'))
      const ui = await $.ui.mount({ ...BAND, surface })
      await ui.press({ key: 'improve' })
      expect(w.toasts.at(-1)).toMatch(/close it, then press Put in draft/)
      expect(w.box.text).toBe('fix the bug')
      expect(await ui.find({ type: 'Text', text: /ship the audit/ })).toBeDefined()
      isDialogUp = false
      await ui.press({ key: 'put' })
      expect(w.box.text).toMatch(/^Audit the logs/)
      expect(await ui.find({ key: 'put' })).toBeUndefined()
      await ui.unmount()
    }
  })
})
