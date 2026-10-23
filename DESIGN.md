# prompt-deepener: design read-back

Status: confirmed by Sytze 2026-10-22 16:30Z. Spec: specs/prompt-deepener.md. Terms: GLOSSARY.md. Per-question record: grilling-decisions.md.

## What it is
A mod that lets Sytze **deepen** a prompt before sending it: run the **original prompt** through the **improver text** ("I want a deeper version of this task, not a bigger one..." four questions, then a rewrite), see the **deepening**, and get a **deepened prompt** in the draft to edit and send. Name: prompt-deepener.

## Where
- Claude Code terminal and desktop first.
- claude.ai project threads via the `++` fallback (a band there is unproven).
- Source on H:\.projects\.project-tools\mods\prompt-deepener, plus its own private GitHub repo.

## Triggers
- An **Improve** button in a band above the prompt. Enter keeps sending as normal; nothing is held by default.
- Chord `ctrl+x d`: the button borrows an engine keybinding action that isn't active at the prompt (candidate `app:diffFileListDown`), which Sytze binds in keybindings.json. Also hotkey `d` after ctrl+x tab focuses the band.
- `++` at the start of a prompt, on every surface: the prompt is held and deepened. If the draft can be filled, the result goes there as with the button. If it can't (threads), Claude replies with the deepening and the deepened prompt, then stops; Sytze sends it or says "go".
- Never offered on slash commands, prompts from peers, plugins or notifications, or empty prompts.

## Deepening
- A side model call with no tools that reads the session's transcript, so it knows the work. In a fresh session it uses the prompt alone.
- Model: always the session's model (the transcript-reading call can't take another; setting dropped 2026-10-22, see spec).
- Improver text: Sytze's paragraph verbatim as the default, editable in the mod's settings.
- Output in the original prompt's language. Each of the 4 answers is at most 3 lines. The deepened prompt has no cap.
- While it runs: the band shows "deepening…" with Cancel, and the draft is locked.

## Result
- The deepened prompt replaces the draft. Never auto-sent.
- The band expands to show the deepening; it clears on send.
- "Restore original" works until send.
- Improve on an already-deepened draft is allowed; the band marks it as already deepened.
- Failure (model error, 90s timeout, reply with no deepened prompt): a toast says why, the draft is untouched, nothing is sent.

## Proof it's right
- Unit tests on the logic.
- A pty e2e in a real terminal, including that `ctrl+x d` reaches the button.
- A live desktop check by Sytze (how the band looks and clicks).

## Known unknowns
- Whether a mod band renders in claude.ai project threads (hence `++`).
- Whether the borrowed chord reaches the button on desktop (documented as terminal-only).
