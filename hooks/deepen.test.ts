import { describe, expect, test } from 'claude-code/testing'

import { DEFAULT_IMPROVER_TEXT, OUTPUT_FORMAT, buildRequest, cutLines, describeFailure, parseReply } from './deepen'

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
