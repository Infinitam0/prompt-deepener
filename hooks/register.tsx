import type { Register } from 'claude-code'

import { DEFAULT_IMPROVER_TEXT } from './deepen'
import { cancel, improve, readBand, reset, restore } from './flow'

/** Borrowed so the chord the person binds to it (ctrl+x d, see the README) presses Improve at the prompt. */
const CHORD_ACTION = 'app:diffFileListDown'

export const register: Register = (on, options) => {
  const improverText = typeof options.improverText === 'string' && options.improverText.trim() !== '' ? options.improverText : DEFAULT_IMPROVER_TEXT

  on('prompt.submit', async ($, e, next) => {
    const isOwn = e.origin.kind === 'composer' || e.origin.kind === 'bridge'
    if (isOwn && (await readBand($)).kind === 'deepening') return { drop: 'Deepening in progress, Cancel first.' }
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
          <Text key="status">deepening… </Text>
          <Button key="cancel" label="Cancel" onPress={() => cancel($)} />
        </Box>
      )
    }
    if (state.kind === 'deepened') {
      return (
        <Box>
          <Text key="status">{`deepened ×${state.count} `}</Text>
          {improveButton('Deepen again')}
          <Button key="restore" label="Restore original" onPress={() => restore($)} />
          <Text key="answers" dimColor>{`\n${state.answers.map((answer, i) => `${i + 1}. ${answer}`).join('\n')}`}</Text>
        </Box>
      )
    }
    // A failed deepening leaves the draft as it was, so a deepening before it can still be restored.
    const isRestorable = state.kind === 'failed' && state.previous.kind === 'deepened'
    return (
      <Box>
        {improveButton(isRestorable ? 'Deepen again' : 'Improve')}
        {isRestorable ? <Button key="restore" label="Restore original" onPress={() => restore($)} /> : null}
        {state.kind === 'failed' ? <Text key="failed" dimColor>{` failed: ${state.reason}`}</Text> : null}
      </Box>
    )
  })
}
