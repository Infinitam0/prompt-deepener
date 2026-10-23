#!/usr/bin/env bash
# Real model, headless (`claude -p`): no draft box exists, so this proves what a plugin test cannot stage.
#   1. deepen(): the real fork over the real transcript answers in the format parseReply accepts.
#   2. Improve and `++` where the box takes no text (`no_composer`): the reply-and-stop turn is submitted, the model
#      answers with the deepening and a fenced deepened prompt, uses no tool, and does not do the task.
# Usage: bash e2e/headless.e2e.sh [model]     (default haiku)
set -u
MOD="$(cd "$(dirname "$0")/.." && pwd)"
MODEL="${1:-haiku}"
WORK="$(mktemp -d)"
RESULT=/tmp/prompt-deepener-e2e-result.json
rm -f "$RESULT"

mkdir -p "$WORK/mod"
cp -r "$MOD/.claude-plugin" "$MOD/hooks" "$MOD/types" "$WORK/mod/"
rm -f "$WORK/mod/hooks/"*.test.*
mv "$WORK/mod/hooks/register.tsx" "$WORK/mod/hooks/mod-register.tsx"
cp "$MOD/e2e/driver/register.tsx" "$WORK/mod/hooks/register.tsx"
# A headless session has no person typing: the driver's prompt carries origin `plugin` with `asUser`. Only that one
# predicate differs from the shipped hook, in this temporary copy.
python3 - "$WORK/mod/hooks/mod-register.tsx" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
old = "const isOwn = e.origin.kind === 'composer'"
assert old in s
open(p, 'w').write(s.replace(old, "const isOwn = (e.origin.kind === 'plugin' && (e.origin as { asUser?: true }).asUser === true) || e.origin.kind === 'composer'"))
PY

fail=0
check() { if eval "$2"; then echo "ok   $1"; else echo "FAIL $1"; fail=1; fi; }

(cd "$WORK" && timeout 240 claude -p "say hi" --plugin-dir "$WORK/mod" --model "$MODEL" \
  --output-format stream-json --verbose < /dev/null > "$WORK/out.jsonl" 2> "$WORK/err.txt")

python3 - "$WORK/out.jsonl" "$WORK/summary.json" <<'PY'
import json, sys
results, tools = [], 0
for line in open(sys.argv[1]):
    try: d = json.loads(line)
    except ValueError: continue
    if d.get('type') == 'assistant':
        tools += sum(1 for c in d['message']['content'] if c.get('type') == 'tool_use')
    if d.get('type') == 'result': results.append(d.get('result', ''))
json.dump({'results': results, 'tools': tools}, open(sys.argv[2], 'w'))
PY
summary() { python3 -c "import json;d=json.load(open('$WORK/summary.json'));$1"; }

check "the deepen result was written" "[ -s $RESULT ]"
check "deepen(): the real reply parsed into 4 answers and a deepened prompt" \
  "python3 -c \"import json;d=json.load(open('$RESULT'));assert d['isOk'] and len(d['answers'])==4 and d['deepenedPrompt'].strip() and all(len(a.split(chr(10)))<=3 for a in d['answers'])\""
check "the reply-and-stop turn ran (a second result)" "summary 'assert len(d[\"results\"])>=2'"
check "Improve's turn answered with the deepening and a fenced deepened prompt" "summary 'r=d[\"results\"][1];assert \"\`\`\`\" in r and \"1.\" in r and \"4.\" in r'"
check "the ++ prompt ran as a third turn with a fenced deepened prompt" "summary 'assert len(d[\"results\"])==3 and chr(96)*3 in d[\"results\"][-1]'"
check "it used no tool" "summary 'assert d[\"tools\"]==0'"
echo "work dir: $WORK"
exit $fail
