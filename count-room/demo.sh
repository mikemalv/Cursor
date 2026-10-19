#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Count Room — live demo walk-through.
#
#   ./demo.sh          pause at each step (Enter to run)
#   ./demo.sh --auto   no pauses
#
# Fixture mode: no CURSOR_API_KEY, no Snowflake account.
# ---------------------------------------------------------------------------
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUTO=0
for a in "$@"; do [ "$a" = "--auto" ] && AUTO=1; done

if [ -x "$HERE/.venv/bin/python" ]; then
  PY="$HERE/.venv/bin/python"
  export PYTHONPATH="$HERE/src${PYTHONPATH:+:$PYTHONPATH}"
else
  PY="${PYTHON:-python3}"
  export PYTHONPATH="$HERE/src${PYTHONPATH:+:$PYTHONPATH}"
fi

if [ -t 1 ]; then
  B=$'\033[1m'; D=$'\033[2m'; C=$'\033[36m'; G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; X=$'\033[0m'
else B=""; D=""; C=""; G=""; Y=""; R=""; X=""; fi

COLS=$(tput cols 2>/dev/null || echo 78)
[ "$COLS" -gt 100 ] 2>/dev/null && COLS=100
[ "$COLS" -lt 40  ] 2>/dev/null && COLS=78
LINE=$(printf '%*s' "$COLS" '' | tr ' ' '-')
N=0

sep()  { printf "\n${D}%s${X}\n" "$LINE"; }
part() { sep; printf "${B}${G}  %s${X}\n" "$1"; sep; printf "\n"; }
note() { printf "  ${Y}> %s${X}\n" "$1"; }

wrap() {
  printf '%s\n' "$2" | fold -s -w $((COLS - 12)) \
    | awk -v l="$1" -v b="$B" -v x="$X" \
        'NR==1 { printf "    %s%-4s%s  %s\n", b, l, x, $0; next }
               { printf "          %s\n", $0 }'
}

step() {
  N=$((N+1))
  sep
  printf "${D}%02d${X}  ${C}${B}\$ %s${X}\n\n" "$N" "$1"
  wrap WHAT "$2"
  wrap WHY  "$3"
  printf "\n"
  [ "$AUTO" = "1" ] || { printf "  ${D}[Enter to run, Ctrl-C to quit]${X} "; read -r _ </dev/tty || true; }
  printf "  ${D}--- output ---${X}\n"
  ( cd "$HERE" && eval "$1" ) 2>&1 | sed 's/^/  /'
  printf "\n"
}

show() {
  N=$((N+1))
  sep
  printf "${D}%02d${X}  ${C}${B}\$ %s${X}\n\n" "$N" "$1"
  wrap WHAT "$2"
  wrap WHY  "$3"
  printf "\n"
  [ "$AUTO" = "1" ] || { printf "  ${D}[Enter to show, Ctrl-C to quit]${X} "; read -r _ </dev/tty || true; }
  printf "  ${D}--- output ---${X}\n"
  ( cd "$HERE" && eval "$1" ) 2>&1 | sed 's/^/  /'
  printf "\n"
}

part "Count Room — governed remediation"
note "No API key. No Snowflake account. Fixture mode is the demo."
note "Same walk is clickable in sdlc-cicd-overview.html → SDK Demo."
printf "\n"

step "$PY -m count_room policy" \
  "Sends all three incidents through gate.py. A tag lookup, not a model call." \
  "Land the architecture in one screen: roi is STANDARD, pii is RESTRICTED_PII, ggr is NGCB_MICS. The zone came from fixtures/tags.json — the offline stand-in for INFORMATION_SCHEMA.TAG_REFERENCES."

step "$PY -m count_room run roi" \
  "STANDARD path. Divide-by-zero in campaign_roi.sql. Profiler, nullif patch, clone verify, lineage." \
  "This is the beat that earns the refusal. Failure to verified patch, nobody woken. Source SQL is not modified — the patch lands in runs/roi/."

show "$PY -c \"print(open('runs/roi/EVIDENCE.md').read().split('## Proposed')[0])\"" \
  "Opens the evidence package the gate allowed to be assembled." \
  "Clone delta, profile, and the tag that set STANDARD. Assembled whether or not anyone will read it."

step "$PY -m count_room run ggr" \
  "NGCB_MICS path. Wrong gaming-day boundary. Profiler and lineage still run. Fix agent is never instantiated." \
  "It knew the one-line fix and did not make it. A tag the compliance team set months ago stops everything downstream."

show "$PY -c \"print(open('runs/ggr/DOSSIER.md').read())\"" \
  "Opens the change-control dossier." \
  "This is the deliverable: quantified dollars, blast radius into a filed report, proposed fix as an attachment, restatement flag. No branch, no commit, no PR."

step "$PY -m count_room run pii" \
  "RESTRICTED_PII path. SELECT * leaked EMAIL and DOB. Patch is proposed. Clone is green. Privacy review FAILs." \
  "Green clone is the trap. ACCESS_HISTORY names four roles. OBJECT_DEPENDENCIES finds PLAYER_LOOKALIKE — a hand-created view not in the SQL repo. Materialized rows are still exposed."

show "$PY -c \"print(open('runs/pii/EVIDENCE.md').read().split('## Proposed')[0])\"" \
  "Opens the evidence package sitting at a human decision." \
  "Two reviewers. The code fix is correct and incomplete. That is a privacy-officer call, not a diff."

part "That's the demo"
note "Optional, needs a personal CURSOR_API_KEY:  $PY -m count_room smoke"
note "Optional, same key:                       $PY -m count_room run roi --live"
printf "\n"
