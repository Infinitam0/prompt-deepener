# Spec: prompt-deepener (deepen a prompt before sending it)

Status: ready-for-agent (seams and dropped model setting confirmed by Sytze 2026-10-22 16:39Z) · Written 2026-10-22 from the "Prompt improver mod" thread · Vocabulary: `mods/prompt-deepener/GLOSSARY.md` · Decisions: `mods/prompt-deepener/grilling-decisions.md` · Read-back: `mods/prompt-deepener/DESIGN.md` · ADR 0001 (side call, not main turn).

## Problem Statement

Sytze's prompts ask for what Sytze already thought of. Sytze wants, on demand, a deeper version of a task, not a bigger one. That means what a top professional would do that wasn't asked, the rawest material they'd start from, the methods and tools they'd use, and what outside evidence would show the result is right. Today Sytze has to paste a fixed paragraph in front of a prompt, read the answer, then copy the rewrite back into the prompt box by hand. That costs a full main-model turn and clutters the transcript with the analysis.

## Solution

A mod, `prompt-deepener`. A band above the prompt offers **Improve** (also chord `ctrl+x d`). Pressing it **deepens** the draft: a side call over the session's own transcript runs the **original prompt** through the **improver text**. The band then shows the **deepening** (four short answers), and the **deepened prompt** replaces the draft for Sytze to edit and send. "Restore original" undoes this until send. Typing `++` at the start of a prompt does the same wherever there is no band. Where the draft box can't be filled (claude.ai threads), Claude instead replies with the deepening and the deepened prompt and stops. Nothing is ever sent without Sytze reading it.

## User Stories

1. As Sytze, I want an Improve button above the prompt, so that deepening is one click away and never in the way.
2. As Sytze, I want Enter to keep sending my prompt unchanged, so that the mod costs nothing when I don't want it.
3. As Sytze, I want a chord (`ctrl+x d`) to press Improve, so that I don't leave the keyboard.
4. As Sytze, I want hotkey `d` to press Improve once ctrl+x tab focuses the band, so that there is a key route even without my own chord binding.
5. As Sytze, I want to start a prompt with `++` to deepen it, so that I can deepen where no band is drawn.
6. As Sytze, I want the `++` marker stripped before deepening, so that it never reaches the model or the deepened prompt.
7. As Sytze, I want the deepened prompt to replace my draft, so that I can edit it before sending.
8. As Sytze, I want the deepening shown in the band next to my draft, so that I see why the prompt changed.
9. As Sytze, I want the band's deepening cleared when I send, so that old analysis never sits next to a new prompt.
10. As Sytze, I want "Restore original" in the band until I send, so that I can back out of a deepening I don't like.
11. As Sytze, I want to deepen an already deepened draft, so that I can push further on purpose.
12. As Sytze, I want the band to mark a draft as already deepened, so that I don't stack deepenings by accident.
13. As Sytze, I want the band to show "deepening…" with a Cancel button while it runs, so that I know it's working and can stop it.
14. As Sytze, I want my draft locked while deepening runs, so that edits I make aren't silently overwritten.
15. As Sytze, I want Cancel to leave my draft exactly as it was, so that cancelling is safe.
16. As Sytze, I want the deepening to know what this session is about, so that "rawest material" names my real files and data, not generic advice.
17. As Sytze, I want deepening to work in a fresh session on the prompt alone, so that it isn't useless before the first turn.
18. As Sytze, I want the deepening in the language of my original prompt, so that a Dutch prompt gets a Dutch deepening.
19. As Sytze, I want each of the four answers kept to at most 3 lines, so that the band stays readable and the result stays deeper, not bigger.
20. As Sytze, I want the deepened prompt uncapped, so that it can say exactly what the deepening found.
21. As Sytze, I want my improver paragraph used verbatim by default, so that the mod asks exactly what I wrote.
22. As Sytze, I want to edit the improver text in the mod's settings, so that I can refine it without changing code.
23. As Sytze, I want a failed deepening (model error, 90-second timeout, reply without a deepened prompt) to show a toast with the reason and leave my draft untouched, so that I never get a half-result in my box.
24. As Sytze, I want nothing ever sent automatically, so that I always read the deepened prompt first.
25. As Sytze, I want slash commands never deepened, so that commands keep working as typed.
26. As Sytze, I want prompts from peers, plugins and notifications never deepened, so that only my own typing is touched.
27. As Sytze, I want an empty prompt never deepened, so that a stray `++` does nothing silly.
28. As Sytze, in a claude.ai project thread, I want `++ <prompt>` to make Claude reply with the deepening and the deepened prompt and then stop, so that I can send it or say "go".
29. As Sytze, I want the same `++` rule everywhere (fill the draft if possible, else the reply-and-stop turn), so that I don't have to remember per-surface behaviour.
30. As Sytze, I want the mod to work in the terminal and the desktop app, so that I can use it wherever I run Claude Code.
31. As the maintainer, I want the deepening's reply parsed into exactly four answers and one deepened prompt, or rejected, so that a malformed reply is a failure and not garbage in the draft.
32. As the maintainer, I want the band's states (idle, deepening, deepened, failed) driven by one state value, so that every surface draws the same thing.

## Implementation Decisions

- **Shape:** a hooks-module mod: a band (`AbovePrompt`), a `prompt.submit` hook for `++`, toasts for failures, and `userConfig` for the improver text. There are no slash commands, no pane and no model tool.
- **Deepen module (pure):** builds the side-call prompt from the improver text, the original prompt and an output-format instruction. It parses the reply into `{ deepening: [4 answers], deepenedPrompt }`, or a failure reason (`no-deepened-prompt`, `wrong-shape`). The output format is fixed by the mod and appended after the improver text, so that a custom improver text can't break parsing. Each answer is cut to 3 lines if the model overruns. The deepened prompt is never cut.
- **Side call (ADR 0001):** `$.model.fork` with that prompt. Fork reuses the main thread's last request: its model, its system prompt and its transcript, served from the prompt cache, with every tool denied. When fork answers `nothing-to-fork` (a fresh session, after `/clear`), it falls back to `$.model.complete` with the session's model and the prompt alone.
- **Model setting dropped (confirmed by Sytze):** fork always uses the main thread's model and takes no model parameter, so a configurable model would mean losing the transcript. The spec drops the setting. See Further Notes.
- **Cancel and timeout:** fork takes no abort signal. Cancel and the 90-second timeout therefore discard the result when it arrives (the call still runs and is billed), and they unlock the draft at once. A `complete` fallback call is aborted for real.
- **Band state:** one session `$.state` value: `idle`; `deepening` (with the original prompt); `deepened` (original prompt, deepening, how many times deepened); or `failed` (reason, cleared on the next edit or press). Sending a prompt resets it to `idle`.
- **Draft fill:** `$.prompt.fill` with mode `replace`. "Restore original" fills the original prompt back. If fill answers `no_composer` (no box on this surface), it falls back to the reply-and-stop turn. If it answers `dialog`, a toast says to close the dialog, and the band keeps the deepened prompt with a "Put in draft" button.
- **Draft lock:** while `deepening`, a `prompt.submit` hook drops Sytze's own submissions with "deepening in progress, Cancel first".
- **`++` path:** in `prompt.submit`, when the origin is the user, there's no command, `isMeta` is unset, and the text starts with `++` with non-empty text after it, drop the submission and deepen the rest as if Improve were pressed. When fill isn't possible, instead pass down a rewritten prompt that asks the main model for the deepening and deepened prompt and to stop without doing the task.
- **Chord:** the Improve Button borrows an engine keybinding action whose own handler isn't mounted at the prompt (candidate `app:diffFileListDown`). The README tells Sytze to bind `ctrl+x d` to it in keybindings.json. The Button also has hotkey `d`.
- **Settings:** `improverText` (string, default Sytze's paragraph verbatim). That's all.
- **Source and install:** source on H:\.projects\.project-tools\mods\prompt-deepener plus a private GitHub repo; a copy in project files.

## Testing Decisions

- A good test drives the mod the way Sytze does (press Improve, type `++`, press Cancel, send) and checks what Sytze sees: the band's drawing, the draft's text, a toast, what was sent or dropped. It never checks the internal state layout.
- **Seam 1, the plugin test runner (main seam):** `claude plugin test` with `$.model.fork` and `$.model.complete` mocked. Cases: Improve leads to deepening, then deepened with the draft replaced; Restore; deepening twice; Cancel; timeout; malformed reply; `nothing-to-fork` fallback; fill refused falls back to the reply-and-stop turn; `++` on user text; `++` skipped for commands, meta, peer/plugin origins and empty text; the draft lock; send resets the band. Each band case is looped over `terminal` and `desktop`. Prior art: next-job-autopilot's hook tests and skill-pipeline's.
- **Seam 2, deepen module:** table tests from reply text to parsed result or failure reason, including language passthrough and the 3-line cut. It's pure, so it's cheap.
- **Seam 3, pty e2e:** a real terminal session with a real model. Bind `ctrl+x d`, type a prompt, press the chord, see the band deepen and the draft replaced, Restore. Prior art: next-job-autopilot's `e2e/` with `pty_run.py`.
- **Live check by Sytze:** the desktop app (does the band draw, do clicks work, does fill work or answer `no_composer`) and one `++` in a claude.ai project thread.
- `claude plugin validate` and `tsc` stay clean.

## Out of Scope

- Holding every Enter for a choice.
- Automatically sending the deepened prompt.
- A pane, slash command or model tool.
- Deepening images or attachments (text only; attachments stay on the draft).
- Choosing a different model for deepening (dropped: the transcript-reading call can't take one).
- Proving a band in claude.ai threads. `++` covers threads.

## Further Notes

- **Changed after grilling:** round 2 settled "model configurable, default session model". The transcript-reading call (`$.model.fork`) can't take a model, so Sytze chose to keep the transcript and drop the setting (2026-10-22).
- **Desktop risk:** `$.prompt.fill` answers `no_composer` on "a surface that draws its own composer". If the desktop app does that, the Improve button there falls back to the reply-and-stop turn, like threads. Only the live check will tell.
- **Cancel cost:** fork can't be aborted, so a cancelled deepening is still billed. Fork's cached prefix keeps that small.
