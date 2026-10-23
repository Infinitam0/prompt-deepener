# prompt-deepener

Deepen a prompt before you send it. An Improve button above the prompt (chord `ctrl+x d`) runs your draft through an improver text, a side call over the session's transcript that asks for a deeper version of the task, not a bigger one. The band shows four short answers, and the deepened prompt replaces your draft for you to edit and send. Nothing is ever sent without you reading it. Details: `SPEC.md`, `DESIGN.md`, `GLOSSARY.md`.

## Use

- **Improve** (band above the prompt, or hotkey `d` after `ctrl+x tab`): deepens the draft.
- **Chord:** bind `ctrl+x d` in `~/.claude/keybindings.json`, see below.
- **Settings:** `improverText` (defaults to the original deeper-not-bigger text).

## Keybinding

A mod cannot define its own chord. The Improve button borrows the engine action `app:diffFileListDown`, which nothing handles at the prompt. Add to `~/.claude/keybindings.json` (merge into an existing `Global` block if you have one):

    { "bindings": [ { "context": "Global", "bindings": { "ctrl+x d": "app:diffFileListDown" } } ] }

Terminal only; verified in a real terminal session.

## Develop

    claude plugin validate .
    claude plugin test .
    tsc -p <tsconfig that includes hooks/ and types/>
