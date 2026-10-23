import { describe, expect, test } from 'claude-code/testing'

import { DEFAULT_IMPROVER_TEXT, OUTPUT_FORMAT, buildReplyAndStopRequest, buildRequest, cutLines, describeFailure, parseReply, unwrapWake } from './deepen'

const reply = (answers: string[], prompt: string) =>
  `${answers.map((a, i) => `<answer-${i + 1}>${a}</answer-${i + 1}>`).join('\n')}\n<deepened-prompt>${prompt}</deepened-prompt>`

describe('buildRequest', () => {
  test('is the improver text, the output format, then the original prompt', () => {
    const request = buildRequest('MY TEXT', 'fix the bug')
    expect(request.indexOf('MY TEXT')).toBe(0)
    expect(request.indexOf(OUTPUT_FORMAT)).toBeGreaterThan(request.indexOf('MY TEXT'))
    expect(request.endsWith('Original prompt:\nfix the bug')).toBe(true)
  })

  test('a blank improver text falls back to the default', () => {
    expect(buildRequest('  ', 'x').startsWith(DEFAULT_IMPROVER_TEXT)).toBe(true)
  })

  test('asks for the original prompt\'s language and no more than 3 lines per answer', () => {
    expect(OUTPUT_FORMAT).toContain('language of the original prompt')
    expect(OUTPUT_FORMAT).toContain('at most 3 lines')
  })
})

describe('parseReply', () => {
  test('four answers and a deepened prompt', () => {
    const parsed = parseReply(reply(['a', 'b', 'c', 'd'], 'Do X, with Y.'))
    expect(parsed).toEqual({ isOk: true, answers: ['a', 'b', 'c', 'd'], deepenedPrompt: 'Do X, with Y.' })
  })

  test('tolerates text and code fences around the tags, and keeps the deepened prompt whole', () => {
    const long = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n')
    const parsed = parseReply(`Here you go:\n\`\`\`\n${reply(['a', 'b', 'c', 'd'], long)}\n\`\`\``)
    expect(parsed.isOk && parsed.deepenedPrompt).toBe(long)
  })

  test('cuts each answer to 3 lines', () => {
    const parsed = parseReply(reply(['1\n2\n3\n4\n5', 'b', 'c', 'd'], 'p'))
    expect(parsed.isOk && parsed.answers[0]).toBe('1\n2\n3')
  })

  test('passes a Dutch reply through untouched', () => {
    const parsed = parseReply(reply(['Wat een topper zou doen', 'b', 'c', 'd'], 'Schrijf een plan.'))
    expect(parsed.isOk && parsed.answers[0]).toBe('Wat een topper zou doen')
    expect(parsed.isOk && parsed.deepenedPrompt).toBe('Schrijf een plan.')
  })

  test('no deepened prompt, or an empty one, is no-deepened-prompt', () => {
    expect(parseReply('<answer-1>a</answer-1>')).toEqual({ isOk: false, reason: 'no-deepened-prompt' })
    expect(parseReply(reply(['a', 'b', 'c', 'd'], '  '))).toEqual({ isOk: false, reason: 'no-deepened-prompt' })
    expect(parseReply('just a chatty reply')).toEqual({ isOk: false, reason: 'no-deepened-prompt' })
  })

  test('a missing or empty answer is wrong-shape', () => {
    expect(parseReply('<answer-1>a</answer-1><deepened-prompt>p</deepened-prompt>')).toEqual({ isOk: false, reason: 'wrong-shape' })
    expect(parseReply(reply(['a', '', 'c', 'd'], 'p'))).toEqual({ isOk: false, reason: 'wrong-shape' })
  })

  test('every failure has a sentence for the toast', () => {
    expect(describeFailure('no-deepened-prompt')).toMatch(/no deepened prompt/)
    expect(describeFailure('wrong-shape')).toMatch(/four answers/)
  })
})

describe('cutLines', () => {
  test('drops blank lines before cutting', () => {
    expect(cutLines('a\n\n\nb\nc\nd')).toBe('a\nb\nc')
  })
})

describe('buildReplyAndStopRequest', () => {
  test('carries the improver text and the original prompt, asks for a reply in the chat and tells the model to stop', () => {
    const request = buildReplyAndStopRequest('MY TEXT', 'plan my launch')
    expect(request.startsWith('MY TEXT')).toBe(true)
    expect(request.endsWith('Original prompt:\nplan my launch')).toBe(true)
    expect(request).toContain('language of the original prompt')
    expect(request).toContain('deepened prompt')
    expect(request).toMatch(/Then stop\. Do not carry out the task itself/)
  })

  test('a blank improver text falls back to the default', () => {
    expect(buildReplyAndStopRequest('', 'x').startsWith(DEFAULT_IMPROVER_TEXT)).toBe(true)
  })
})

describe('unwrapWake', () => {
  const wake = '<wake reason="mention"><thread><message trigger="true" id="1">++ it&#39;s a &lt;b&gt;</message></thread><system-note>keep</system-note></wake>'
  test('finds the triggering message, unescaped, and rewraps a replacement into the same envelope', () => {
    const w = unwrapWake(wake)!
    expect(w.text).toBe("++ it's a <b>")
    expect(w.rewrap('x < y')).toBe('<wake reason="mention"><thread><message trigger="true" id="1">x &lt; y</message></thread><system-note>keep</system-note></wake>')
  })
  test('leaves bare text and wakes without a triggering message alone', () => {
    expect(unwrapWake('++ plain')).toBeNull()
    expect(unwrapWake('<wake><message id="1">hi</message></wake>')).toBeNull()
  })
})
