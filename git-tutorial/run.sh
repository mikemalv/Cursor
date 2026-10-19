#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Git, start to finish -- one continuous story.
#
#   init -> stage -> commit -> create the repo on GitHub -> push
#        -> change a file and push it -> branch -> merge -> push
#
# Every command is shown with what it does and why, and you press Enter to run
# it. This one is REAL: it creates a private repo under github.com/mikemalv.
#
#   ./run.sh          walk through it
#   ./run.sh --auto   no pauses
#   ./run.sh clean    delete the local folder and the GitHub repo
#
# For the deeper material -- reset/reflog, conflicts, rebase, stash, bisect --
# see ./deep-dive.sh
# ---------------------------------------------------------------------------
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

GH_USER="mikemalv"
GH_REPO="git-practice"
# The practice repo is created next to this script, inside git-tutorial/.
# Override with:  GIT_PRACTICE_DIR=/somewhere/else ./run.sh
REPO_DIR="${GIT_PRACTICE_DIR:-$HERE/$GH_REPO}"

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
RUN_IN="$HOME"
HAVE_GH=0

sep()  { printf "\n${D}%s${X}\n" "$LINE"; }
part() { sep; printf "${B}${G}  %s${X}\n" "$1"; sep; printf "\n"; }
note() { printf "  ${Y}> %s${X}\n" "$1"; }
die()  { printf "\n  ${R}%s${X}\n\n" "$1"; exit 1; }

wrap() {
  printf '%s\n' "$2" | fold -s -w $((COLS - 12)) \
    | awk -v l="$1" -v b="$B" -v x="$X" \
        'NR==1 { printf "    %s%-4s%s  %s\n", b, l, x, $0; next }
               { printf "          %s\n", $0 }'
}

pause() { [ "$AUTO" = "1" ] && return 0; printf "  ${D}[Enter to continue]${X} "; read -r _ </dev/tty || true; }

# step <command> <what> <why>
step() {
  N=$((N+1))
  sep
  printf "${D}%02d${X}  ${C}${B}\$ %s${X}\n\n" "$N" "$1"
  wrap WHAT "$2"
  wrap WHY  "$3"
  printf "\n"
  [ "$AUTO" = "1" ] || { printf "  ${D}[Enter to run, Ctrl-C to quit]${X} "; read -r _ </dev/tty || true; }
  printf "  ${D}--- output ---${X}\n"
  ( cd "$RUN_IN" && eval "$1" ) 2>&1 | sed 's/^/  /'
  printf "\n"
}

confirm() {
  [ "$AUTO" = "1" ] && return 0
  printf "  ${Y}%s [y/N] ${X}" "$1"
  local ans; read -r ans </dev/tty || ans=n
  case "$ans" in y|Y|yes|YES) return 0 ;; *) return 1 ;; esac
}

# ===========================================================================
clean() {
  printf "\n"
  if [ -d "$REPO_DIR" ]; then
    confirm "Delete the local folder $REPO_DIR ?" && { rm -rf "$REPO_DIR"; echo "  removed $REPO_DIR"; }
  else echo "  no local folder at $REPO_DIR"; fi
  if command -v gh >/dev/null && gh repo view "$GH_USER/$GH_REPO" >/dev/null 2>&1; then
    confirm "Delete github.com/$GH_USER/$GH_REPO ?" && gh repo delete "$GH_USER/$GH_REPO" --yes
  else echo "  no GitHub repo $GH_USER/$GH_REPO (or gh not installed)"; fi
  printf "\n"
}

# ===========================================================================
main() {

part "Before we start -- is your machine ready?"
note "Git has no login. Two separate things must be set up, and people mix them up:"
note "  1. Commit identity -- the name/email stamped onto commits. Just a label."
note "  2. Authentication -- proof to GitHub that you are $GH_USER. A key or token."
note "No credentials are stored by this script. See CREDENTIALS.md."
printf "\n"

command -v git >/dev/null || die "git is not installed. Run: xcode-select --install"
printf "  ${G}OK${X}  %s\n" "$(git --version)"

GN=$(git config --global user.name 2>/dev/null || true)
GE=$(git config --global user.email 2>/dev/null || true)
if [ -z "$GN" ] || [ -z "$GE" ]; then
  printf "  ${R}MISSING${X}  commit identity. Run these two, then start again:\n"
  printf "      git config --global user.name  \"Mike Malveira\"\n"
  printf "      git config --global user.email \"mike.malveira@gmail.com\"\n"
  die "The email must be verified on your GitHub account, or commits won't link to your profile."
fi
printf "  ${G}OK${X}  commits will be authored as: %s <%s>\n" "$GN" "$GE"

if command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
  printf "  ${G}OK${X}  GitHub CLI logged in as: %s\n" "$(gh api user --jq .login 2>/dev/null || echo '?')"
  HAVE_GH=1
else
  printf "  ${Y}NOTE${X}  GitHub CLI not logged in.\n"
  printf "        Easiest fix:  brew install gh  &&  gh auth login\n"
  printf "        Without it, you'll create the repo by hand at github.com/new\n"
fi
printf "\n"
pause

# -----------------------------------------------------------------------
part "PART 1 -- Make a repository on your own machine"
note "A git repo is just a folder with a .git directory inside it."

if [ -d "$REPO_DIR" ]; then
  note "$REPO_DIR already exists."
  confirm "Delete it and start fresh?" && rm -rf "$REPO_DIR"
fi

step "mkdir -p '$REPO_DIR' && cd '$REPO_DIR' && pwd" \
  "Creates an ordinary empty folder and moves into it." \
  "Nothing git-specific yet. Git works on whatever folder you point it at -- there is no project registry and no server involved."

RUN_IN="$REPO_DIR"

step "git init -b main" \
  "Turns this folder into a git repository, with the first branch named 'main'." \
  "This creates the hidden .git folder. Everything git knows about this project -- every commit, branch and setting -- lives in there. Delete it and you have a plain folder back. The -b flag names the starting branch; GitHub expects 'main'."

step "ls -a" \
  "Lists everything, including hidden entries." \
  "There it is: .git . That single directory IS the repository. The rest of the folder is just your files."

step "git status" \
  "Reports what has changed and what is staged." \
  "You will type this more than any other git command. When you are lost, run it -- it tells you where you are and usually prints the exact command you need next."

# -----------------------------------------------------------------------
part "PART 2 -- Stage some files and make your first commit"
note "A change moves through three places:"
note "    working tree  --git add-->  staging area  --git commit-->  repository"

step "printf '# Git Practice\\n\\nLearning git properly.\\n' > README.md && printf 'notes go here\\n' > notes.md && printf 'API_KEY=super-secret-123\\n' > .env && ls -a" \
  "Creates two files we want in the repo, and one that must never go in." \
  "The .env is deliberate. Committing a credential is the most common real mistake in git, and once it is pushed you must treat it as leaked -- rotating the secret, not just deleting the file."

step "printf '.env\\n*.log\\n' > .gitignore && cat .gitignore" \
  "Lists patterns git should pretend it cannot see." \
  "Write this BEFORE your first commit. .gitignore only stops files being added -- it has no power over files git already tracks, so it cannot un-commit a secret afterwards."

step "git status --short" \
  "The compact view. '??' means git has never seen this file." \
  "Notice .env is missing from the list entirely. That is .gitignore doing its job. Keeping status quiet is what makes the signal in it useful."

step "git add README.md notes.md .gitignore" \
  "Copies the current contents of these three files into the staging area." \
  "Name files explicitly while you are learning. 'git add .' stages everything including things you never looked at, which is exactly how a forgotten .env ends up committed."

step "git status --short" \
  "'A' in the first column means staged and ready to commit." \
  "The staging area is git's best feature: it lets you commit a deliberate, coherent set of changes rather than everything you happened to touch today."

step "git diff --staged" \
  "Shows exactly what is about to go into the commit." \
  "Run this before every commit. It is your last chance to catch a debug print, a stray key, or a deletion you did not mean. (Plain 'git diff' shows the opposite -- what is NOT yet staged -- which is why it would look empty right now.)"

step "git commit -m 'Initial commit: README, notes and gitignore'" \
  "Records the staged snapshot permanently in .git ." \
  "A commit stores a full snapshot plus its parent, author, timestamp and message, identified by a SHA hash. This is still entirely local -- nothing has touched the internet yet."

step "git log --oneline" \
  "One line per commit: short SHA and message." \
  "That SHA is the commit's permanent address. You can use the first 7 characters anywhere git expects a commit reference."

# -----------------------------------------------------------------------
part "PART 3 -- Put it on GitHub"
note "Everything so far is local. Now we connect it to github.com/$GH_USER."

if [ "$HAVE_GH" = "1" ]; then
  if gh repo view "$GH_USER/$GH_REPO" >/dev/null 2>&1; then
    note "github.com/$GH_USER/$GH_REPO already exists -- connecting to it instead of creating it."
    step "git remote add origin \"\$(gh repo view $GH_USER/$GH_REPO --json sshUrl --jq .sshUrl)\" 2>/dev/null; git remote -v" \
      "Points this local repo at the existing GitHub repo, under the nickname 'origin'." \
      "'origin' is a convention, not a keyword -- just the name most people give their main remote."
    step "git push -u origin main" \
      "Uploads your commits and links local main to origin/main." \
      "-u sets the upstream, so from now on plain 'git push' and 'git pull' know where to go without arguments."
  elif confirm "Create a PRIVATE repo at github.com/$GH_USER/$GH_REPO ?"; then
    step "gh repo create $GH_USER/$GH_REPO --private --source=. --remote=origin --push" \
      "Creates the repo on GitHub, adds it as 'origin', and pushes main -- in one command." \
      "The fastest way to go from a local folder to a repo on GitHub. --private keeps practice work off your public profile; we delete it at the end. Done by hand this is three steps: create the empty repo on the website, 'git remote add origin <url>', then 'git push -u origin main'."
  else
    note "Skipped. Create it by hand at github.com/new (name it $GH_REPO), then run:"
    note "    cd $REPO_DIR"
    note "    git remote add origin git@github.com:$GH_USER/$GH_REPO.git"
    note "    git push -u origin main"
    note "Then re-run this script and it will pick up from here."
    printf "\n"
  fi
else
  note "No GitHub CLI. Create an EMPTY repo named '$GH_REPO' at github.com/new, then:"
  note "    cd $REPO_DIR"
  note "    git remote add origin git@github.com:$GH_USER/$GH_REPO.git"
  note "    git push -u origin main"
  note "Then re-run this script and it will pick up from here."
  printf "\n"
fi

step "git remote -v" \
  "Lists the remotes this repo knows about, with fetch and push URLs." \
  "The fastest way to answer 'where would a push actually go?'. Worth checking before your first push to any repo you care about."

step "git log --oneline --decorate -1" \
  "Shows the latest commit with the labels pointing at it." \
  "Look for both 'main' and 'origin/main'. When they sit on the same commit, your machine and GitHub agree. When they drift apart, that is exactly what push and pull are for."

# -----------------------------------------------------------------------
part "PART 4 -- The everyday loop: change, commit, push"
note "This is the cycle you will run hundreds of times a week."

step "printf '\\n## Progress\\n\\n- Made my first commit\\n' >> README.md && git status --short" \
  "Edits a file git is already tracking. 'M' means modified." \
  "Note the difference from earlier: '??' was a file git had never seen; 'M' is a tracked file that has changed."

step "git diff" \
  "Shows what changed in your working tree versus the last commit." \
  "'+' lines are being added, '-' removed. Read this before staging -- it takes seconds and catches a lot."

step "git add README.md && git commit -m 'Add a progress section to the README'" \
  "Stages the change and commits it." \
  "Once files are already tracked you can do both at once with 'git commit -am \"msg\"'. That shortcut only picks up tracked files, though -- brand new files always need an explicit 'git add'."

step "git push" \
  "Uploads the new commit to GitHub." \
  "No arguments needed, because the '-u' earlier recorded where main belongs. Edit, add, commit, push -- that is the entire everyday loop."

step "git log --oneline --decorate -2" \
  "Confirms main and origin/main are level again." \
  "Both labels on the same commit means GitHub has everything you have."

# -----------------------------------------------------------------------
part "PART 5 -- Branching: work without touching main"
note "A branch is not a copy of your files. It is a movable label pointing at one"
note "commit -- which is why creating one is instant no matter how big the repo."

step "git switch -c feature/add-changelog" \
  "Creates a new branch at the current commit and switches onto it." \
  "Nothing was copied; git wrote a small file containing a SHA. The older spelling is 'git checkout -b', which you will still see everywhere. Slashes in branch names are just a naming convention for grouping."

step "git branch" \
  "Lists local branches; '*' marks the one you are on." \
  "Two branches now, both pointing at the same commit. They only diverge once you commit on one of them."

step "printf '# Changelog\\n\\n## v0.1.0\\n- First commit\\n- Added progress notes\\n' > CHANGELOG.md && git add CHANGELOG.md && git commit -m 'Add a changelog'" \
  "Does some work and commits it -- on the branch, not on main." \
  "This commit exists only on feature/add-changelog. main has no idea it happened."

step "git log --oneline --decorate --graph --all -4" \
  "Shows both branches and where each label sits." \
  "feature/add-changelog is now one commit ahead of main. This is what 'diverged' looks like."

step "git push -u origin feature/add-changelog" \
  "Pushes the branch to GitHub and links it." \
  "Branches are pushed individually -- pushing main does not push your other branches. On a real team, this is the moment you would open a pull request."

note "On a real project the next step is a pull request, so a human reviews the"
note "branch before it reaches main:"
note "      gh pr create --fill        then:   gh pr merge --squash"
note "We'll merge locally instead, so you can see the mechanics a PR sits on top of."
printf "\n"
pause

# -----------------------------------------------------------------------
part "PART 6 -- Merging the branch back into main"

step "git switch main && ls" \
  "Switches back to main." \
  "CHANGELOG.md has vanished from the folder. It is not lost -- it simply does not exist in this version of history. Switching branches rewrites your working tree to match whatever that branch points at."

step "git merge feature/add-changelog" \
  "Brings the branch's commit into main." \
  "This is a 'fast-forward': main gained no commits of its own while you were on the branch, so git just slides the main label forward. No merge commit is needed because there was nothing to reconcile."

step "ls && git log --oneline --decorate --graph -4" \
  "CHANGELOG.md is back, and main now contains the branch's work." \
  "If main HAD moved on separately, git would have made a merge commit instead. And if you had both edited the same line, you would get a conflict to resolve by hand -- deep-dive.sh lesson 5 walks through exactly that."

step "git push" \
  "Sends the merged main to GitHub." \
  "Merging locally does not update GitHub. Nothing reaches the remote until you push."

step "git branch -d feature/add-changelog" \
  "Deletes the local branch label now its work is merged." \
  "-d refuses if the branch has unmerged commits, which is a useful safety net. Deleting a branch never deletes commits -- it only removes the label pointing at them."

step "git push origin --delete feature/add-changelog" \
  "Deletes the branch on GitHub too." \
  "Local and remote branches are separate namespaces. Deleting one has no effect on the other, which surprises people constantly."

step "git log --oneline --decorate --graph --all -6" \
  "The finished history." \
  "One line of commits on main, mirrored on origin/main. You have now done the complete cycle: init, stage, commit, publish, change, branch, merge, push."

# -----------------------------------------------------------------------
part "Done"
printf "  Local repo:   ${C}%s${X}\n" "$REPO_DIR"
[ "$HAVE_GH" = "1" ] && printf "  On GitHub:    ${C}https://github.com/%s/%s${X}\n" "$GH_USER" "$GH_REPO"
printf "\n"
note "Open it in a browser:   gh repo view $GH_USER/$GH_REPO --web"
note "Clean everything up:    ./run.sh clean"
note "Go deeper:              ./deep-dive.sh list"
note "  (reset and reflog, real merge conflicts, rebase, stash, cherry-pick, bisect)"
printf "\n"
}

case "${1:-}" in
  clean) clean ;;
  help|-h|--help) sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//' ;;
  *) main ;;
esac
