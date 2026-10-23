# prompt-deepener: grilling decisions

Thread "Prompt improver mod", started 2026-10-22.

## Round 1 (agreed 2026-10-22 15:57Z)
1. Surfaces: Claude Code (terminal, desktop) first; claude.ai project threads too, via a typed marker until a band is proven to render there.
2. Trigger: an "Improve" button in a band above the prompt (plus a key, see round 2); Enter keeps sending normally. `++` prefix as fallback where there is no band. No hold-on-every-Enter.
3. Who deepens: a side model call (`$.model.complete`, no tools) that also reads the session's transcript. Not a main-model turn.
4. Result: the deepened prompt replaces the draft for Sytze to edit and send; the deepening is shown beside it; undo back to the original prompt. Never auto-sent.
5. Improver text: Sytze's paragraph verbatim as default, editable in the mod's settings.
6. Never offered on: slash commands, peer/plugin/notification prompts, empty prompts. Only Sytze's own typed prompts.
7. Name: prompt-deepener. Terms in GLOSSARY.md.
8. Home: H:\.projects\.project-tools\mods\prompt-deepener + its own private GitHub repo; may join the consolidated mods repo later.

## Round 2 (agreed 2026-10-22 15:59Z)
1. Key: band Button borrows an engine keybinding action's chord (Sytze binds the chord in keybindings.json), plus a band hotkey `d` after ctrl+x tab. Constraint: a mod can't define its own chord; the borrowed action only fires the Button while the engine's own handler for it is not mounted.
2. Deepening shown in the band, expanded, next to the draft; clears on send.
3. "Restore original" button in the band until send; nothing after send.
4. Deepening a deepened prompt is allowed (works on the current draft); the band marks the draft as already deepened.
5. `++` in threads: Claude replies with the deepening + deepened prompt and stops; Sytze sends it or says "go".
6. Model: configurable, default the session's model.
7. While deepening: band shows "deepening…" + Cancel; draft locked.
8. Proof: unit tests, a pty e2e in a real terminal, and a live desktop check by Sytze.

## Round 3 (agreed 2026-10-22 16:26Z)
1. Chord: `ctrl+x d`, bound to a borrowed engine action whose handler isn't mounted at the prompt (candidate `app:diffFileListDown`); the e2e must prove the Button receives it.
2. `++` is one rule everywhere: hold the prompt, deepen, try to fill the draft; where the draft can't be filled (threads), fall back to a turn that replies with deepening + deepened prompt and stops.
3. Deepening in the original prompt's language; each of the 4 answers at most 3 lines; deepened prompt uncapped.
4. Failure (model error, 90s timeout, reply without a deepened prompt): toast with the reason, draft untouched, nothing sent.
5. Fresh session with no transcript: deepen the prompt on its own.

Frontier empty as of round 3. Design read-back: DESIGN.md.

## After grilling (2026-10-22 16:39Z)
- Round 2 Q6 reversed: no model setting. `$.model.fork` (the only transcript-aware call) takes no model; transcript wins. Seams in the spec confirmed.
