import type { Register } from 'claude-code'

import { DEFAULT_IMPROVER_TEXT } from './deepen'
import { deepen, startDeepening } from './flow'
import { register as mod } from './mod-register'

// e2e wrapper, never shipped: the mod as it is, plus a driver that after the first turn (1) deepens a prompt the way
// Improve does, with the real model over the real transcript, and writes the parsed result to RESULT, and (2) runs
// Improve's path where no draft box exists (headless), which submits the reply-and-stop turn, and (3) after that turn a
// `++` prompt typed as the person (asUser), which the hook rewrites into the same turn.
const RESULT = '/tmp/prompt-deepener-e2e-result.json'

export const register: Register = (on, options) => {
  mod(on, options)
  let turns = 0
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    turns += 1
    if (turns === 2) {
      await $.prompt.submit({ text: '++ plan my product launch', asUser: true })
    }
    if (turns === 1) {
      const deepened = await deepen($, DEFAULT_IMPROVER_TEXT, 'plan my product launch')
      await $.fs.write(RESULT, JSON.stringify(deepened))
      await startDeepening($, DEFAULT_IMPROVER_TEXT, 'plan my product launch', null)
    }
    return result
  })
}
