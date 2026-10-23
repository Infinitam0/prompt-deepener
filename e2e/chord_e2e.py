"""A real interactive terminal session with a real model: the Improve chord, the band and Restore.

  python3 e2e/chord_e2e.py [--model haiku]

Starts `claude --plugin-dir <this mod>` in a pseudo-terminal (a throwaway HOME with `ctrl+x d` bound to the
borrowed action in keybindings.json), keeps a rendered copy of the screen (pyte) and drives it like a person:
  A. fresh session: type a prompt, press ctrl+x d, wait for the deepening; the draft is replaced and the band shows
     the four answers (fork has nothing to fork yet, so this is the plain-completion fallback).
  B. Restore (hotkey r after ctrl+x tab) puts the original prompt back.
  C. after a real turn: ctrl+x d again, now over the transcript through fork; the band deepens once more.
Linux/macOS use the pty module; Windows uses pywinpty (pip install pywinpty pyte), which is untested here.
Needs a signed-in `claude` (or the container's proxy auth) on PATH. Exit 0 when every check passes.
"""

import argparse
import json
import os
import shutil
import sys
import tempfile
import time

import pyte

MOD = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROWS, COLS = 90, 140  # tall: the band gets at most half the rows less the prompt's, and a deepened prompt is long
CTRL_X, TAB = b'\x18', b'\t'


class Terminal:
    def __init__(self, argv, env, cwd):
        self.screen = pyte.Screen(COLS, ROWS)
        self.stream = pyte.ByteStream(self.screen)
        if os.name == 'nt':
            from winpty import PtyProcess

            import queue
            import threading

            self.child = PtyProcess.spawn(argv, cwd=cwd, env=env, dimensions=(ROWS, COLS))
            self.fd = None
            self.chunks = queue.Queue()

            def read_loop():
                # winpty's read blocks, so a thread feeds a queue and pump() keeps its deadline
                while True:
                    try:
                        chunk = self.child.read(4096)
                    except Exception:
                        return
                    if chunk:
                        self.chunks.put(chunk)

            threading.Thread(target=read_loop, daemon=True).start()
        else:
            import fcntl
            import pty
            import struct
            import termios

            self.pid, self.fd = pty.fork()
            if self.pid == 0:
                try:
                    os.chdir(cwd)
                    os.execvpe(argv[0], argv, env)
                finally:
                    os._exit(127)  # exec failed (claude not on PATH): never fall through into the parent's code
            fcntl.ioctl(self.fd, termios.TIOCSWINSZ, struct.pack('HHHH', ROWS, COLS, 0, 0))

    def write(self, data: bytes):
        if self.fd is None:
            self.child.write(data.decode('utf-8', 'replace'))
        else:
            os.write(self.fd, data)

    def pump(self, seconds: float):
        end = time.time() + seconds
        while time.time() < end:
            if self.fd is None:
                try:
                    self.stream.feed(self.chunks.get(timeout=0.2).encode('utf-8', 'replace'))
                except Exception:
                    pass
                continue
            import select

            ready, _, _ = select.select([self.fd], [], [], 0.2)
            if ready:
                try:
                    data = os.read(self.fd, 65536)
                except OSError:
                    return
                self.stream.feed(data)

    def text(self) -> str:
        return '\n'.join(line.rstrip() for line in self.screen.display).rstrip()

    def draft(self) -> str:
        lines = [line for line in self.screen.display if line.lstrip().startswith('❯')]
        return lines[-1].lstrip()[1:].strip() if lines else ''

    def wait_for(self, needle: str, timeout: float) -> bool:
        end = time.time() + timeout
        while time.time() < end:
            self.pump(0.5)
            if needle in self.text():
                return True
        return False

    def wait_idle(self, quiet: float, timeout: float) -> bool:
        """True once the screen has not changed for `quiet` seconds."""
        end, last, since = time.time() + timeout, self.text(), time.time()
        while time.time() < end:
            self.pump(0.5)
            now = self.text()
            if now != last:
                last, since = now, time.time()
            elif time.time() - since >= quiet:
                return True
        return False

    def kill(self):
        if self.fd is None:
            self.child.terminate(force=True)
        else:
            try:
                os.kill(self.pid, 9)
            except OSError:
                pass


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', default='haiku')
    args = ap.parse_args()

    home = tempfile.mkdtemp(prefix='pd-e2e-home-')
    work = tempfile.mkdtemp(prefix='pd-e2e-work-')
    os.makedirs(os.path.join(home, '.claude'))
    source = os.path.expanduser('~/.claude.json')
    full = json.load(open(source)) if os.path.exists(source) else {}
    cfg = {k: full[k] for k in ('oauthAccount', 'userID', 'machineID') if k in full}  # only what a fresh HOME needs to be signed in
    cfg.update({'hasCompletedOnboarding': True, 'theme': 'dark', 'projects': {work: {'hasTrustDialogAccepted': True, 'hasCompletedProjectOnboarding': True}}})
    fd = os.open(os.path.join(home, '.claude.json'), os.O_WRONLY | os.O_CREAT, 0o600)
    with os.fdopen(fd, 'w') as f:
        json.dump(cfg, f)
    json.dump({'bindings': [{'context': 'Global', 'bindings': {'ctrl+x d': 'app:diffFileListDown'}}]}, open(os.path.join(home, '.claude', 'keybindings.json'), 'w'))

    env = {k: v for k, v in os.environ.items() if k not in ('CLAUDECODE', 'CLAUDE_CODE_CHILD_SESSION', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_REMOTE_SESSION_ID', 'WT_SESSION')}
    env.update({'HOME': home, 'USERPROFILE': home, 'TERM': 'xterm-256color'})

    term = Terminal(['claude', '--plugin-dir', MOD, '--model', args.model], env, work)
    failed = []

    def check(name: str, ok: bool):
        print(('ok   ' if ok else 'FAIL ') + name)
        if not ok:
            failed.append(name)

    try:
        check('the band draws Improve', term.wait_for('[ Improve ]', 40))
        original = 'plan my product launch'
        term.write(original.encode())
        term.pump(1.5)
        check('the prompt is in the draft', term.draft() == original)

        # A. fresh session
        term.write(CTRL_X + b'd')
        check('A: the chord starts a deepening', term.wait_for('deepening', 15) or term.wait_for('deepened', 1))
        check('A: the band shows four answers', term.wait_for('deepened ×1', 120) and all(f'{n}. ' in term.text() for n in '1234'))
        deepened = term.draft()
        check('A: the draft was replaced by a deepened prompt, nothing was sent', deepened != '' and deepened != original and 'Original prompt' not in term.text())

        # B. Restore
        term.write(CTRL_X + TAB)
        term.pump(1)
        term.write(b'r')
        term.pump(2)
        check('B: Restore puts the original prompt back', term.draft() == original)
        check('B: the band is idle again', '[ Improve ]' in term.text() and 'deepened ×' not in term.text())

        # C. after a real turn, through fork
        term.write(b'\x15')  # clear the draft line
        term.write(b'say hi in one word')
        term.pump(0.5)
        term.write(b'\r')
        check('C: the plain turn finished', term.wait_for('Hi', 60) and term.wait_idle(5, 90))
        term.write(original.encode())
        term.pump(1)
        term.write(CTRL_X + b'd')
        check('C: after a turn, the chord deepens over the transcript', term.wait_for('deepened ×1', 120))
        check('C: the draft was replaced again', term.draft() not in ('', original))
        check('no hook was skipped for running past its budget', 'ran past its' not in term.text() and 'hook skipped' not in term.text())
    finally:
        print('--- screen at the end ---')
        print(term.text()[-2500:])
        term.kill()
        shutil.rmtree(home, ignore_errors=True)
        shutil.rmtree(work, ignore_errors=True)
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
