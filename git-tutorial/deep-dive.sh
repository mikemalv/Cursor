#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Interactive Git tutorial.
#
# Every command is shown with WHAT it does and WHY it matters before it runs.
# You press Enter to execute. Everything happens inside ./sandbox -- a throwaway
# repo this script creates. No repository you care about is ever touched.
#
#   ./run.sh setup       check your git + GitHub credentials are ready
#   ./run.sh list        show the lessons
#   ./run.sh 4           run lesson 4
#   ./run.sh all         run every local lesson in order
#   ./run.sh reset       delete the sandbox and start clean
#   ./run.sh 4 --auto    run without pausing
# ---------------------------------------------------------------------------
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SANDBOX="$HERE/sandbox"
AUTO=0
for a in "$@"; do [ "$a" = "--auto" ] && AUTO=1; done

if [ -t 1 ]; then
  B=$'\033[1m'; D=$'\033[2m'; C=$'\033[36m'; G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; X=$'\033[0m'
else B=""; D=""; C=""; G=""; Y=""; R=""; X=""; fi

COLS=$(tput cols 2>/dev/null || echo 78)
[ "$COLS" -gt 100 ] 2>/dev/null && COLS=100
[ "$COLS" -lt 40  ] 2>/dev/null && COLS=78
LINE=$(printf '%*s' "$COLS" '' | tr ' ' '-')

N=0
sep()   { printf "\n${D}%s${X}\n" "$LINE"; }
# wrap <LABEL> <text> -- soft-wraps long explanations to the terminal width.
# Uses awk rather than a read loop: 'read' returns non-zero on a final line with
# no trailing newline, which silently drops it.
wrap() {
  printf '%s\n' "$2" | fold -s -w $((COLS - 12)) \
    | awk -v l="$1" -v b="$B" -v x="$X" \
        'NR==1 { printf "    %s%-4s%s  %s\n", b, l, x, $0; next }
               { printf "          %s\n", $0 }'
}
title() { sep; printf "${B}${G}  %s${X}\n" "$1"; sep; printf "\n"; }
note()  { printf "  ${Y}> %s${X}\n" "$1"; }
pause() { [ "$AUTO" = "1" ] && return 0; printf "  ${D}[Enter to run, Ctrl-C to quit]${X} "; read -r _ </dev/tty || true; }

# step <command> <what it does> <why it matters>
step() {
  N=$((N+1))
  sep
  printf "${D}%02d${X}  ${C}${B}\$ %s${X}\n\n" "$N" "$1"
  wrap WHAT "$2"
  wrap WHY  "$3"
  printf "\n"
  pause
  printf "  ${D}--- output ---${X}\n"
  ( cd "$SANDBOX" 2>/dev/null || cd "$HERE"; eval "$1" ) 2>&1 | sed 's/^/  /'
  printf "\n"
}

# say <command> <what it does> <why it matters>   -- shown, never executed
say() {
  N=$((N+1))
  sep
  printf "${D}%02d${X}  ${C}${B}\$ %s${X}   ${D}(you run this one)${X}\n\n" "$N" "$1"
  wrap WHAT "$2"
  wrap WHY  "$3"
  printf "\n"
}

tracked() { git ls-files --error-unmatch "$1" >/dev/null 2>&1; }

fresh_sandbox() {
  rm -rf "$SANDBOX"; mkdir -p "$SANDBOX"
  ( cd "$SANDBOX" && git init -q -b main \
      && git config user.name  "$(git config --global user.name  || echo 'Mike Malveira')" \
      && git config user.email "$(git config --global user.email || echo 'mike_malveira@yahoo.com')" )
}
ensure_sandbox() { [ -d "$SANDBOX/.git" ] || fresh_sandbox; }

# Baseline files must be TRACKED, not merely present -- lesson 2 rebuilds the
# sandbox with only README + .gitignore, so a later lesson could otherwise
# reference a file git has never seen.
seed_repo() {
  ensure_sandbox
  ( cd "$SANDBOX" || exit 0
    tracked README.md || { printf '# Git Practice\n\nA sandbox for learning git.\n' > README.md
                           git add README.md && git commit -qm "Initial commit: add README"; }
    tracked alpha.txt || { printf 'alpha\n' > alpha.txt
                           git add alpha.txt && git commit -qm "Add alpha.txt"; }
    tracked beta.txt  || { printf 'beta\n'  > beta.txt
                           git add beta.txt  && git commit -qm "Add beta.txt"; }
  ) >/dev/null 2>&1
}

# ===========================================================================
setup_check() {
  title "Setup check -- is your machine ready to talk to GitHub?"
  local ok=1
  sep
  printf "  ${B}git installed${X}\n"
  if command -v git >/dev/null; then printf "  ${G}OK${X}  %s\n" "$(git --version)"
  else printf "  ${R}MISSING${X}  install with: xcode-select --install\n"; ok=0; fi

  sep
  printf "  ${B}commit identity${X}  ${D}(stamped onto every commit you make)${X}\n"
  local n e
  n=$(git config --global user.name 2>/dev/null); e=$(git config --global user.email 2>/dev/null)
  if [ -n "$n" ] && [ -n "$e" ]; then printf "  ${G}OK${X}  %s <%s>\n" "$n" "$e"
  else
    printf "  ${R}NOT SET${X}\n"
    printf "      git config --global user.name  \"Mike Malveira\"\n"
    printf "      git config --global user.email \"mike_malveira@yahoo.com\"\n"
    printf "  ${Y}The email must be one GitHub has verified on your account, or your\n"
    printf "  commits will not link to github.com/mikemalv.${X}\n"; ok=0
  fi

  sep
  printf "  ${B}GitHub CLI${X}  ${D}(easiest way to authenticate -- optional but recommended)${X}\n"
  if command -v gh >/dev/null; then
    if gh auth status >/dev/null 2>&1; then
      printf "  ${G}OK${X}  logged in as: %s\n" "$(gh api user --jq .login 2>/dev/null || echo '?')"
    else printf "  ${Y}INSTALLED, NOT LOGGED IN${X}   run:  gh auth login\n"; fi
  else
    printf "  ${Y}NOT INSTALLED${X}   run:  brew install gh   then:  gh auth login\n"
  fi

  sep
  printf "  ${B}SSH key${X}  ${D}(the other way to authenticate)${X}\n"
  if ls ~/.ssh/id_ed25519.pub ~/.ssh/id_rsa.pub >/dev/null 2>&1; then
    printf "  ${G}OK${X}  key found: %s\n" "$(ls ~/.ssh/*.pub 2>/dev/null | head -1)"
    printf "  ${D}testing github.com...${X}\n"
    ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=8 -T git@github.com 2>&1 | sed 's/^/      /'
  else
    printf "  ${Y}NO KEY${X}   create one:\n"
    printf "      ssh-keygen -t ed25519 -C \"mike_malveira@yahoo.com\"\n"
    printf "      ssh-add --apple-use-keychain ~/.ssh/id_ed25519\n"
    printf "      gh ssh-key add ~/.ssh/id_ed25519.pub --title \"MacBook Air\"\n"
  fi

  sep
  printf "  ${B}credential helper${X}  ${D}(where HTTPS tokens get stored)${X}\n"
  local h; h=$(git config --global credential.helper 2>/dev/null)
  if [ -n "$h" ]; then printf "  ${G}OK${X}  %s\n" "$h"
  else printf "  ${Y}NOT SET${X}   run:  git config --global credential.helper osxkeychain\n"; fi

  sep
  printf "\n"
  note "See CREDENTIALS.md for what each of these actually is and which to pick."
  [ "$ok" = "1" ] && printf "  ${G}${B}You are ready. Try: ./run.sh 2${X}\n\n" || printf "  ${Y}Fix the items above, then re-run ./run.sh setup${X}\n\n"
}

# ===========================================================================
lesson_1() {
  title "1. Identity and configuration"
  note "Git has no accounts. It stamps whatever name and email you configure onto"
  note "every commit -- so setting these correctly is the whole of 'who am I' in git."

  step "git --version" \
    "Prints the installed git version." \
    "Anything 2.23 or newer gives you 'switch' and 'restore', which this tutorial uses. Older git still works, you just fall back to 'checkout' for everything."

  step "git config --list --show-origin | head -20" \
    "Lists every setting git can see, and the file each one came from." \
    "Settings live in three layers -- --system (whole machine), --global (your user, ~/.gitconfig), --local (this repo, .git/config). The nearest one wins. When git behaves unexpectedly, this command tells you which file to blame."

  say "git config --global user.name \"Mike Malveira\"" \
    "Sets the author name recorded on every commit you make, on this machine." \
    "It is not a login, it is a label. Git will happily let you type anyone's name -- GitHub decides who you really are separately, via your SSH key or token."

  say "git config --global user.email \"mike_malveira@yahoo.com\"" \
    "Sets the author email on every commit." \
    "This is the field GitHub matches to link a commit to github.com/mikemalv. If the email is not verified on your account, your commits show as an anonymous author with no avatar. This is the single most common reason people's contribution graph stays empty."

  say "git config --global init.defaultBranch main" \
    "New repositories start on a branch called 'main' instead of 'master'." \
    "GitHub defaults new repos to 'main'. If your local default is 'master' you get a mismatched branch name on your very first push, which is an annoying way to start."

  say "git config --global core.editor \"code -w\"" \
    "Uses VS Code (or Cursor: 'cursor -w') for commit messages instead of vim." \
    "The '-w' matters: it tells the editor to block until you close the tab. Without it git thinks you saved an empty message and aborts the commit."

  say "git config --global alias.lg \"log --oneline --graph --decorate --all\"" \
    "Creates a new command, 'git lg'." \
    "Aliases are just text substitution, but this particular one turns the unreadable default log into a visual branch graph. It is the highest-value thirty seconds you will spend configuring git."

  say "git config --global pull.rebase false" \
    "Declares that 'git pull' should merge rather than rebase." \
    "Modern git refuses to pull until you state a preference, because the two behaviours produce genuinely different history. 'false' = merge (safe default). 'true' = rebase (tidier, rewrites your local commits)."

  say "git config --global credential.helper osxkeychain" \
    "Stores HTTPS credentials in the macOS Keychain." \
    "Without this, git asks for your token on every single push. With it, you authenticate once. This is where your GitHub token actually lives -- never in a file in your repo."
}

# ---------------------------------------------------------------------------
lesson_2() {
  title "2. From an empty folder to your first commit"
  fresh_sandbox
  note "The core mental model: a change lives in one of three places, and the basic"
  note "commands just move it between them."
  note ""
  note "   working tree  --git add-->  staging area  --git commit-->  repository"

  step "ls -a" \
    "Lists the sandbox, including hidden files." \
    "Note '.git' already exists -- that folder IS the repository. Every commit, branch and config for this project lives inside it. Delete it and you have an ordinary folder again; nothing else on disk changes."

  step "git status" \
    "Reports what has changed relative to the last commit, and what is staged." \
    "This is the command you will type more than any other. When you are lost in git, 'git status' almost always tells you both where you are and what to type next -- it prints suggestions."

  step "printf '# Git Practice\\n' > README.md && printf 'secret-token-123\\n' > .env && ls" \
    "Creates a file we want tracked, and one that must never be committed." \
    "Setting up the most common real-world mistake: credentials landing in git history. Once a secret is committed and pushed, treat it as leaked -- removing it later requires rewriting history AND rotating the secret."

  step "printf '.env\\nsandbox-tmp/\\n*.log\\n' > .gitignore && cat .gitignore" \
    "Creates a .gitignore listing patterns git should pretend not to see." \
    "Add it BEFORE your first commit. .gitignore only prevents files being added -- it has no effect on files git is already tracking, so it cannot un-commit a secret after the fact."

  step "git status --short" \
    "The compact status view: '??' means untracked." \
    "Notice .env is absent from the list entirely. That is .gitignore working. Getting to a clean, quiet 'git status' is what makes the signal in it useful."

  step "git add README.md .gitignore" \
    "Copies the current content of these two files into the staging area." \
    "Name files explicitly. 'git add .' stages everything including things you did not look at, which is exactly how the .env you forgot to ignore ends up in a commit. 'git add -p' is better still -- it walks you through change by change."

  step "git status --short" \
    "Shows 'A' for added -- these files are now staged." \
    "Staging is a deliberate intermediate step, and it is git's best feature. It lets you commit a coherent subset of your work rather than everything you happen to have touched."

  step "git diff" \
    "Shows the difference between your working tree and the staging area." \
    "Empty here, and that is the lesson: we already staged everything, so there is nothing 'not yet staged' to show. People often conclude git is broken at this point. It is not -- you want the next command."

  step "git diff --staged" \
    "Shows the difference between the staging area and the last commit." \
    "THIS is the review of what you are about to commit. Run it before every commit and you will catch debug prints, stray keys and accidental deletions. ('--cached' is the same thing; the article's 'git diff -- cached' with a space is a typo and will not work.)"

  step "git commit -m 'Initial commit: add README and gitignore'" \
    "Permanently records the staged snapshot as a commit in .git." \
    "A commit is a full snapshot plus a parent pointer, an author, a timestamp and a message -- identified by a SHA hash. It is local only. Nothing has touched GitHub yet."

  step "git log" \
    "Prints the commit history, newest first." \
    "Each entry's 40-character SHA is its permanent address. You can usually abbreviate it to the first 7 characters anywhere git expects a commit."

  step "git log --oneline --graph --decorate --all" \
    "The compact visual history: one line per commit, with a branch graph." \
    "--all includes every branch, not just the current one, and --decorate shows where branch names and tags point. This is the view worth aliasing as 'git lg'."
}

# ---------------------------------------------------------------------------
lesson_3() {
  title "3. Undoing things safely"
  seed_repo
  note "Since git 2.23, the overloaded 'git checkout' is split into two clear commands:"
  note "'git switch' changes branches. 'git restore' throws away changes."

  step "printf 'alpha\\nOOPS bad edit\\n' > alpha.txt && git status --short" \
    "Makes an unwanted edit. 'M' means modified but not staged." \
    "This is the most common state you will ever be in: you changed something in the working tree and have not decided what to do with it yet."

  step "git diff" \
    "Shows exactly what you changed, line by line." \
    "Always look before you discard. '-' lines are being removed, '+' lines added. Thirty seconds here prevents throwing away an hour of work you forgot you did."

  step "git restore alpha.txt && cat alpha.txt && git status --short" \
    "Overwrites the file with the version from the last commit." \
    "The change is gone with no undo -- uncommitted work is the one thing git cannot recover. The old spelling was 'git checkout -- alpha.txt', which you will still see everywhere."

  step "printf 'alpha\\nstaged by mistake\\n' > alpha.txt && git add alpha.txt && git status --short" \
    "Stages a change you did not mean to stage. 'A'/'M' in the first column = staged." \
    "Setting up the other half: sometimes you want to un-stage without losing the edit."

  step "git restore --staged alpha.txt && git status --short" \
    "Removes it from the staging area but leaves the file exactly as you edited it." \
    "Note the marker moved from the first column to the second -- still modified, no longer staged. The old spelling was 'git reset HEAD alpha.txt'. Nothing was destroyed here."

  step "git restore alpha.txt" \
    "Now also discards the edit itself." \
    "Two separate operations because they are two separate decisions: 'do not commit this yet' and 'I do not want this at all'."

  step "git commit -q --allow-empty -m 'Typo in this mesage' && git log --oneline -1" \
    "Creates a commit with a misspelled message." \
    "--allow-empty just lets us commit with no file changes, so we have something to fix."

  step "git commit -q --amend -m 'Fix: corrected commit message' && git log --oneline -1" \
    "Replaces the last commit with a new one -- new message, new SHA." \
    "Amend does not edit the old commit, it makes a replacement. Perfect before you push. After you push to a shared branch it rewrites history other people already have, which is how you cause a bad afternoon."

  step "printf 'gamma\\n' > gamma.txt && git add gamma.txt && git commit -qm 'Add gamma.txt' && git log --oneline -2" \
    "A normal commit that we will now undo the safe way." \
    "Setting up the difference between 'undo by rewriting' and 'undo by adding'."

  step "git revert --no-edit HEAD && git log --oneline -3 && ls" \
    "Creates a NEW commit whose content is the exact inverse of the target commit." \
    "The original commit stays in history; the mistake and its correction are both visible. This is the ONLY undo that is safe on a branch other people have pulled, because it adds history rather than rewriting it. The article never mentions it, which is a real omission."
}

# ---------------------------------------------------------------------------
lesson_4() {
  title "4. The three resets, and how to rescue yourself"
  seed_repo
  note "'reset' moves the branch pointer backwards. The flag decides what happens"
  note "to the changes those commits contained."

  step "git log --oneline -3" \
    "Shows where we are before we start breaking things." \
    "Note the SHA at the top -- that is what HEAD points at. 'HEAD~1' means one commit before it."

  step "printf 'delta\\n' > delta.txt && git add delta.txt && git commit -qm 'Add delta.txt' && git log --oneline -1" \
    "Creates a commit to experiment on." \
    "We will undo this same commit three different ways."

  step "git reset --soft HEAD~1 && git log --oneline -1 && git status --short" \
    "Moves the branch back one commit. The changes stay STAGED." \
    "The commit is gone, delta.txt is still staged and ready. Use --soft when the code was right but the commit was not: wrong message, forgot a file, want to split it in two."

  step "git commit -qm 'Add delta.txt (take two)' && git reset --mixed HEAD~1 && git status --short" \
    "Moves the branch back one commit AND unstages. Files stay on disk." \
    "delta.txt now shows as '??' -- untracked again, but still there. --mixed is the default, so plain 'git reset HEAD~1' does this. Use it when you want to re-stage things differently."

  step "git add delta.txt && git commit -qm 'Add delta.txt (take three)' && git log --oneline -1" \
    "Recommits it so we can destroy it properly." \
    "Third and final version of the same commit."

  step "git reset --hard HEAD~1 && git log --oneline -1 && ls" \
    "Moves the branch back AND deletes the changes from disk." \
    "delta.txt is gone from the listing. This is the one that hurts, and the one people run in a panic. There is no confirmation prompt."

  note "You just destroyed a commit. Here is why that is almost never fatal:"

  step "git reflog -8" \
    "Shows every position HEAD has occupied in this repo, most recent first." \
    "The reflog is git's black box recorder. It includes commits that no branch points at any more -- the ones 'git log' can no longer show you. Entries survive roughly 90 days. This is the command to run BEFORE you panic, not after."

  step "git reset --hard \$(git reflog --format='%H %gs' | grep -m1 'take three' | cut -d' ' -f1) && git log --oneline -1 && ls" \
    "Finds the 'lost' commit in the reflog and resets the branch back onto it." \
    "delta.txt is back. The commit was never actually deleted -- it was only unreachable, because no branch or tag pointed at it. Recovering it is just pointing something at it again."

  step "git reset --hard HEAD~1" \
    "Removes it again so later lessons start from a tidy state." \
    "Now you know it is recoverable, doing this is much less frightening."

  note "reflog recovers COMMITS. It cannot recover changes you never committed --"
  note "which is the real argument for committing early and often."
}

# ---------------------------------------------------------------------------
lesson_5() {
  title "5. Branching, merging, and a real conflict"
  seed_repo
  note "A branch is not a copy of your files. It is a movable label pointing at one"
  note "commit. That is why creating one is instant regardless of repo size."

  step "git branch" \
    "Lists local branches; '*' marks the current one." \
    "One branch so far. 'main' is just a label with no special powers -- the convention is entirely social."

  step "git switch -c feature/pricing" \
    "Creates a new branch at the current commit and switches to it." \
    "Old spelling: 'git checkout -b feature/pricing'. Nothing was copied; git wrote a 41-byte file containing a SHA."

  step "printf 'price = 100\\n' > pricing.txt && git add pricing.txt && git commit -qm 'Add pricing' && git log --oneline -1" \
    "Does some work on the branch." \
    "This commit exists only on feature/pricing. main has no idea about it."

  step "git switch main && ls" \
    "Switches back to main." \
    "pricing.txt has vanished from the folder. Switching branches rewrites your working tree to match that branch's commit -- the file still exists, just not in this version of history."

  step "git merge feature/pricing && git log --oneline --graph -3" \
    "Brings the branch's commits into main." \
    "This is a 'fast-forward': main had no new commits of its own, so git just slides the label forward. No merge commit is created because nothing needed reconciling."

  step "git branch -d feature/pricing && git branch" \
    "Deletes the now-merged branch label." \
    "-d refuses if the branch has unmerged commits, which is a useful safety net. -D forces it. Deleting a branch never deletes commits -- and even if it strands them, reflog still has them."

  note "Now the part most tutorials skip entirely: an actual conflict."

  step "git switch -c feature/discount && printf 'price = 80\\n' > pricing.txt && git commit -qam 'Discount to 80'" \
    "Branch A changes the price to 80." \
    "-a stages every already-tracked file that changed, so you can skip 'git add'. It does NOT pick up new untracked files."

  step "git switch main && printf 'price = 120\\n' > pricing.txt && git commit -qam 'Raise price to 120'" \
    "Branch B changes the SAME line to a different value." \
    "Two branches, one line, two answers. Git can merge different regions of a file automatically -- it cannot merge two answers to the same question."

  step "git merge feature/discount; true" \
    "Attempts the merge. It stops with a conflict." \
    "Git deliberately refuses to guess. The merge is paused, not failed -- you are now mid-merge and git is waiting for you."

  step "cat pricing.txt" \
    "Shows the conflict markers git wrote into the file." \
    "Between '<<<<<<< HEAD' and '=======' is your current branch's version. Between '=======' and '>>>>>>>' is the incoming branch's. You delete the markers and leave the content you want -- which can be either side, both, or something new."

  step "git status" \
    "Shows 'Unmerged paths' and tells you exactly what to do next." \
    "Read this output rather than guessing. It names the files still in conflict and gives you the commands to either finish or abandon."

  step "printf 'price = 90\\n' > pricing.txt && git add pricing.txt && git commit -qm 'Merge: settle on 90' && git log --oneline --graph -4" \
    "Resolves by choosing a third value, stages the resolution, and completes the merge." \
    "'git add' on a conflicted file is how you tell git 'I have settled this'. The resulting merge commit has two parents -- you can see the fork and rejoin in the graph."

  step "git branch -D feature/discount >/dev/null; git log --oneline -1" \
    "Tidies up." \
    "If a conflict ever gets away from you, 'git merge --abort' returns everything to the state before you started."
}

# ---------------------------------------------------------------------------
lesson_6() {
  title "6. Rebase, and how it differs from merge"
  seed_repo

  step "git switch -c feature/logging 2>/dev/null || git switch feature/logging" \
    "Creates a feature branch." \
    "Standard start."

  step "printf 'log to stdout\\n' > logging.txt && git add logging.txt && git commit -qm 'Add logging'" \
    "One commit of work on the feature." \
    "Remember its position -- it is about to move."

  step "git switch main && printf 'v2\\n' >> README.md && git commit -qam 'Update README on main'" \
    "Meanwhile main gains a commit of its own." \
    "The branches have now diverged: each has a commit the other does not. This is the normal state of any repo with more than one person."

  step "git log --oneline --graph --all -6" \
    "Shows two divergent lines of history." \
    "Look at the shape. Merge and rebase resolve this identically in content and completely differently in shape."

  step "git switch feature/logging && git rebase main" \
    "Replays your branch's commits on top of the current tip of main." \
    "Your commit gets a NEW SHA. It is a copy with a different parent, not a move -- the original is now unreferenced (and still in reflog). This is what 'rewriting history' means concretely."

  step "git log --oneline --graph --all -6" \
    "Shows one straight line instead of a fork." \
    "Compare with the merge graph in lesson 5. Same code, different story about how it got there. Teams argue about this endlessly; both are defensible."

  step "git switch main && git merge feature/logging && git branch -d feature/logging" \
    "Merges the rebased branch, which is now a clean fast-forward." \
    "That is the practical payoff of rebasing: because your work now sits directly on top of main, the merge needs no merge commit at all."

  note "THE GOLDEN RULE: never rebase commits that other people have already pulled."
  note "Rebase gives every commit a new SHA. Anyone holding the old ones now has a"
  note "divergent copy of the same work, and untangling that is a genuinely bad day."

  say "git rebase -i HEAD~3" \
    "Interactive rebase: opens an editor listing your last 3 commits so you can squash, reword, reorder or drop them." \
    "The polite thing to do before opening a pull request -- turn 'wip', 'fix', 'fix again' into one clean commit. Safe on your own unpushed branch; the golden rule still applies everywhere else."
}

# ---------------------------------------------------------------------------
lesson_7() {
  title "7. Stash, cherry-pick, tags, and clean"
  seed_repo

  step "printf 'half-finished work\\n' > wip.txt && git add wip.txt && printf 'more mess\\n' >> alpha.txt && git status --short" \
    "You are mid-task with both staged and unstaged changes when something urgent lands." \
    "You cannot switch branches cleanly with a messy tree, and you do not want to commit half-done work."

  step "git stash push -u -m 'wip: half done' && git status --short && ls" \
    "Shelves all your changes and returns the working tree to the last commit." \
    "The -u is important: without it, untracked files (wip.txt) are left behind and follow you to the other branch, which is a confusing surprise. -m gives the stash a label so 'stash list' is readable."

  step "git stash list" \
    "Lists the shelf." \
    "Stashes are a stack -- stash@{0} is the most recent. They are easy to forget about, which is why the message matters."

  step "git stash pop && git status --short" \
    "Re-applies the most recent stash and removes it from the shelf." \
    "'git stash apply' does the same but keeps the entry, which is safer if the re-apply might conflict -- you get a second attempt."

  step "git checkout -- alpha.txt 2>/dev/null; rm -f wip.txt; git status --short" \
    "Cleans up the practice mess." \
    "Back to a clean tree for the next section."

  step "git switch -c hotfix/typo && printf 'fixed typo\\n' > typo.txt && git add typo.txt && git commit -qm 'Fix typo' && git log --oneline -1" \
    "Makes a single commit on another branch." \
    "The setup for wanting one specific commit somewhere else, without the whole branch."

  step "git switch main && git cherry-pick \$(git log --oneline -1 hotfix/typo | cut -d' ' -f1) && git log --oneline -2" \
    "Copies that one commit onto the current branch." \
    "Common for hotfixes: the fix was made on a release branch and you need it on main too, without dragging along everything else on that branch. Like rebase, it creates a copy with a new SHA."

  step "git branch -D hotfix/typo >/dev/null; git tag -a v0.1.0 -m 'First practice release' && git tag -n" \
    "Creates an annotated tag pointing at the current commit." \
    "-a stores an author, date and message -- a real object in the repo. A bare 'git tag v0.1.0' makes a lightweight tag that is just a name with none of that. Use -a for anything you would call a release."

  step "git show v0.1.0 --stat | head -12" \
    "Shows the tag's message and the commit it points at." \
    "Tags are permanent labels on a commit. Unlike branches, they never move."

  step "printf 'junk\\n' > junk.txt && printf 'more junk\\n' > junk2.txt && git clean -n" \
    "DRY RUN: lists the untracked files 'git clean' would delete." \
    "Always run -n first. git clean deletes files git has never seen, which means git has no copy of them and reflog cannot help you. This is the most genuinely dangerous command in daily use."

  step "git clean -f && ls" \
    "Actually deletes them." \
    "-f is required; git refuses to run without it. Add -d to include directories, and -x to also delete files your .gitignore is hiding -- which will happily remove your node_modules and your .env."
}

# ---------------------------------------------------------------------------
lesson_8() {
  title "8. Remotes and GitHub (github.com/mikemalv)"
  seed_repo
  note "These commands touch YOUR real GitHub account, so they are shown, not run."
  note "Run './run.sh setup' first if you have not checked your credentials."
  note "Credentials do NOT go in this script -- see CREDENTIALS.md for where they live."

  say "gh auth status" \
    "Reports whether the GitHub CLI is logged in, and as whom." \
    "'gh auth login' walks you through it in a browser and also configures git's credential helper, which is why it is the easiest route."

  say "cd $SANDBOX" \
    "Work from the sandbox." \
    "So that nothing real is at risk while you practise force-pushing."

  say "gh repo create mikemalv/git-practice --private --source=. --remote=origin --push" \
    "Creates the repo on GitHub, adds it as the remote 'origin', and pushes -- in one command." \
    "The fastest path. --private keeps your practice mess off your public profile. Delete the repo when you are done."

  say "git remote add origin git@github.com:mikemalv/git-practice.git" \
    "Manual alternative: records a nickname ('origin') for a remote URL." \
    "'origin' is pure convention, not a keyword. A repo can have several remotes -- 'origin' for yours, 'upstream' for the project you forked."

  say "git remote -v" \
    "Lists remotes with their fetch and push URLs." \
    "The quickest way to answer 'where would this actually push to?' -- worth checking before your first push to any repo."

  say "git push -u origin main" \
    "Uploads your local main branch to the remote and sets it as the upstream." \
    "-u is the part people skip. It records the link so that from then on plain 'git push' and 'git pull' know what you mean without arguments."

  say "git fetch origin" \
    "Downloads new commits from the remote and updates origin/main -- but changes nothing in your working tree." \
    "Completely safe, always. It updates your knowledge of the remote without touching your work. When unsure, fetch first and look."

  say "git log --oneline HEAD..origin/main" \
    "Lists commits the remote has that you do not." \
    "Run it after fetching to see exactly what a pull would bring in before you let it in."

  say "git pull" \
    "= git fetch + git merge. Downloads and immediately integrates." \
    "Convenient, occasionally surprising, and the source of the mystery merge commits in most people's history."

  say "git pull --rebase" \
    "= git fetch + git rebase. Replays your local commits on top of theirs." \
    "Keeps history linear and avoids merge bubbles. Safe for your own un-pushed local commits -- which is exactly what pull deals with."

  say "git push --force-with-lease" \
    "Force-pushes, but refuses if the remote has moved since you last fetched." \
    "Use this INSTEAD of the article's 'git push --force'. Plain --force overwrites the remote unconditionally and will silently delete a colleague's commits. --force-with-lease gives you the same capability with a seatbelt."

  say "git clone git@github.com:mikemalv/git-practice.git /tmp/clone-test" \
    "Downloads a full copy of the repo, with all history, into a new folder." \
    "clone = init + remote add origin + fetch + checkout. The clone has the entire history, which is why git works offline."

  say "cd /tmp/clone-test && printf 'from the clone\\n' >> README.md && git commit -qam 'Edit from clone' && git push" \
    "Makes a change in the second copy and pushes it -- playing the part of a teammate." \
    "Now the remote has a commit your original copy has never seen."

  say "cd $SANDBOX && git pull" \
    "Back in the original: fetches and merges your 'teammate's' commit." \
    "Feeling that round trip once teaches you more about distributed version control than any diagram."

  say "git push origin --delete old-branch" \
    "Deletes a branch on the remote." \
    "Deleting a local branch does not touch the remote, and vice versa. They are separate namespaces."

  say "git fetch --prune" \
    "Removes local references to remote branches that no longer exist." \
    "Without it, 'git branch -r' fills up with branches deleted months ago."
}

# ---------------------------------------------------------------------------
lesson_9() {
  title "9. Reading history like a detective"
  seed_repo

  step "git log --oneline -5" \
    "One line per commit: short SHA and message." \
    "Your starting point for any investigation. If commit messages are bad, everything downstream is harder -- which is the argument for writing decent ones."

  step "git log --stat -2" \
    "Adds a per-commit summary of which files changed and by how many lines." \
    "Fast way to find the commit that touched the area you care about, without reading any diffs."

  step "git log -p -1" \
    "Shows the full patch for each commit." \
    "The actual change. Add a path at the end -- 'git log -p -- somefile' -- to follow one file's entire history."

  step "git log --oneline --author='Mike' --since='30 days ago' | head -5" \
    "Filters history by author and time." \
    "Also useful: --grep='fix' to search messages, and -S'someString' to find commits that added or removed a specific piece of code."

  step "git show HEAD --stat" \
    "Everything about a single commit: metadata plus what changed." \
    "Works with any reference -- a SHA, a tag, a branch name, HEAD~3."

  step "git diff HEAD~2 HEAD -- README.md" \
    "Compares two points in history, scoped to one file." \
    "git diff takes any two references. This is how you answer 'what changed in this file between the release and now'."

  step "git blame README.md" \
    "Annotates every line with the commit and author that last changed it." \
    "The fastest way to find who to ask about a line of code. Not for assigning blame -- for finding context."

  step "git log --oneline --all --graph | head -12" \
    "The overall shape of the repository." \
    "Branches, merges and where everything currently points, in one view."

  say "git bisect start && git bisect bad && git bisect good v0.1.0" \
    "Starts a binary search through history for the commit that introduced a bug." \
    "You mark the current state bad and a known-good older point, then git checks out the midpoint and you say 'good' or 'bad'. It finds the culprit in log2(n) steps -- roughly 10 tests across a thousand commits."

  say "git bisect reset" \
    "Ends the bisect and returns you to where you started." \
    "Always finish with this, or you are left sitting on a detached HEAD in the middle of history wondering why nothing looks right."
}

usage() {
  cat <<'USAGE'
Git tutorial -- runnable, sandboxed, nothing real at risk.

  ./run.sh setup        check your git + GitHub credentials
  ./run.sh list         list the lessons
  ./run.sh 1..9         run one lesson
  ./run.sh all          run lessons 1-7 and 9 (8 needs your GitHub credentials)
  ./run.sh reset        delete the sandbox
  ./run.sh <n> --auto   run without pausing at each step

Everything happens in ./sandbox -- delete that folder any time.
Credentials never go in these files. See CREDENTIALS.md.
USAGE
}

list() {
  cat <<'LIST'
  setup  Check your git identity, GitHub CLI, SSH key and credential helper
  1      Identity and configuration
  2      From an empty folder to your first commit
  3      Undoing things safely (restore, amend, revert)
  4      The three resets, and rescuing yourself with reflog
  5      Branching, merging, and a real conflict
  6      Rebase, and how it differs from merge
  7      Stash, cherry-pick, tags, clean
  8      Remotes and GitHub (github.com/mikemalv)   <- shows commands, does not run them
  9      Reading history like a detective
LIST
}

case "${1:-}" in
  ""|help|-h|--help) usage ;;
  list) list ;;
  setup) setup_check ;;
  reset) rm -rf "$SANDBOX"; echo "sandbox removed." ;;
  all) for i in 1 2 3 4 5 6 7 9; do "lesson_$i"; done
       sep; printf "\n  ${G}${B}Done. Lesson 8 (GitHub) needs your credentials: ./run.sh 8${X}\n\n" ;;
  [1-9]) "lesson_$1" ;;
  *) usage; exit 1 ;;
esac
