import type { Register } from 'claude-code'

import { DEFAULT_IMPROVER_TEXT, buildReplyAndStopRequest } from './deepen'
import { cancel, improve, probeFill, putInDraft, readBand, reset, restore, startDeepening } from './flow'

/** Borrowed so the chord the person binds to it (ctrl+x d, see the README) presses Improve at the prompt. */
const CHORD_ACTION = 'app:diffFileListDown'

export const register: Register = (on, options) => {
  const improverText = typeof options.improverText === 'string' && options.improverText.trim() !== '' ? options.improverText : DEFAULT_IMPROVER_TEXT

  on('prompt.submit', async ($, e, next) => {
    const isOwn = e.origin.kind === 'composer' || e.origin.kind === 'bridge'
    if (isOwn && (await readBand($)).kind === 'deepening') return { drop: 'Deepening in progress, Cancel first.' }

    // `++ prompt` typed by the person: deepen it as if Improve were pressed, and send nothing.
    const marked = isOwn && e.command === undefined && e.isMeta === undefined ? /^\+\+\s*([\s\S]*\S)/.exec(e.text) : null
    if (marked !== null) {
      const text = marked[1]!
      // Where the box takes no text (a thread) the main model gets the request as this turn and stops after answering.
      if ((await probeFill($)) === 'no_composer') return next({ ...e, text: buildReplyAndStopRequest(improverText, text) })
      // Started unawaited: a hook that awaits a model call inside the turn's own chain can hang the session.
      void startDeepening($, improverText, text, e.text, true)
      return { drop: 'Deepening your prompt…' }
    }

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
          {state.isInDraft ? null : <Button key="put" label="Put in draft" onPress={() => putInDraft($)} />}
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
