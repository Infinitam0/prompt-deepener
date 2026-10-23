# prompt-deepener

Deepen a prompt before you send it. An Improve button above the prompt (chord `ctrl+x d`) runs your draft through an improver text, a side call over the session's transcript that asks for a deeper version of the task, not a bigger one. The band shows four short answers, and the deepened prompt replaces your draft for you to edit and send. Nothing is ever sent without you reading it. Details: `SPEC.md`, `DESIGN.md`, `GLOSSARY.md`.

## Use

- **Improve** (band above the prompt, or hotkey `d` after `ctrl+x tab`): deepens the draft. While it runs the band shows `deepening…` and **Cancel** (hotkey `c`); your own submissions are refused until you cancel or it finishes. A model error, a reply in the wrong shape, or 90 seconds without an answer shows a toast and leaves the draft alone.
- **Restore original** (hotkey `r`): puts the prompt as first typed back, until you send.
- **`++`**: start a prompt with `++ ` and press Enter to deepen it without the button. Where the draft box takes no text (a claude.ai thread), Claude replies with the deepening and the deepened prompt and stops, and you send the prompt or say "go".
- The band is cut to half the terminal's height less the prompt's, and a deepened prompt is long: if the four answers are scrolled out of view, `ctrl+x tab` focuses the band and the arrows scroll it.
- **Chord:** bind `ctrl+x d` in `~/.claude/keybindings.json`, see below.
- **Settings:** `improverText` (defaults to the original deeper-not-bigger text).

## Keybinding

A mod cannot define its own chord. The Improve button borrows the engine action `app:diffFileListDown`, which nothing handles at the prompt. Add to `~/.claude/keybindings.json` (merge into an existing `Global` block if you have one):

    { "bindings": [ { "context": "Global", "bindings": { "ctrl+x d": "app:diffFileListDown" } } ] }

Terminal only; verified in a real terminal session.

## Tests

    claude plugin test .            # unit tests with the model mocked
    bash e2e/headless.e2e.sh        # real model, headless: fork, the no-draft-box fallback, ++
    python3 e2e/chord_e2e.py        # real model, real terminal (pty): ctrl+x d, the band, Restore

`chord_e2e.py` needs `pip install pyte`. It runs on Linux and macOS with the standard `pty` module. On Windows it uses ConPTY through `pip install pywinpty pyte`; that path is written but has not been run. Both e2e scripts start a real `claude` with the mod and use the real model, so they cost a few cents.

## Develop

    claude plugin validate .
    claude plugin test .
    tsc -p <tsconfig that includes hooks/ and types/>
