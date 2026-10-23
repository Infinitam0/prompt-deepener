import type { Register } from 'claude-code'

import { DEFAULT_IMPROVER_TEXT } from './deepen'
import { improve, readBand, reset } from './flow'

/** Borrowed so the chord the person binds to it (ctrl+x d, see the README) presses Improve at the prompt. */
const CHORD_ACTION = 'app:diffFileListDown'

export const register: Register = (on, options) => {
  const improverText = typeof options.improverText === 'string' && options.improverText.trim() !== '' ? options.improverText : DEFAULT_IMPROVER_TEXT

  on('prompt.submit', async ($, e, next) => {
    await reset($)
    return next(e)
  })

  // A survey keeps the band to itself.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const state = await readBand($)
    const { Box, Text, Button } = $.ui.resolve(e)

    const improveButton = (label: string) => (
      <Button key="improve" label={label} hotkey="d" action={CHORD_ACTION} onPress={() => improve($, improverText)} />
    )

    if (state.kind === 'deepening') {
      return (
        <Box>
          <Text key="status">deepening…</Text>
        </Box>
      )
    }
    if (state.kind === 'deepened') {
      return (
        <Box>
          <Text key="status">{`deepened${state.count > 1 ? ` ×${state.count}` : ''} `}</Text>
          {improveButton('Deepen again')}
          <Text key="answers" dimColor>{`\n${state.answers.map((answer, i) => `${i + 1}. ${answer}`).join('\n')}`}</Text>
        </Box>
      )
    }
    return (
      <Box>
        {improveButton('Improve')}
        {state.kind === 'failed' ? <Text key="failed" dimColor>{` failed: ${state.reason}`}</Text> : null}
      </Box>
    )
  })
}
