# Git, hands-on

Two scripts. Start with the first one.

```bash
cd ~/Interview_Prep/git-tutorial
./run.sh
```

Every command is shown with **WHAT** it does and **WHY** it matters, separated by a
full-width rule, and you press Enter to run it. Nothing is hidden and nothing runs
without you seeing it first.

---

## `./run.sh` — the whole story, once, for real

One continuous walkthrough, about 32 commands:

```
init  ->  stage  ->  commit  ->  create the repo on GitHub  ->  push
      ->  edit a file and push the change
      ->  branch  ->  commit on the branch  ->  push the branch
      ->  merge back into main  ->  push  ->  delete the branch
```

**This one is real.** It creates `git-tutorial/git-practice/` right next to the script
and a **private** repo at `github.com/mikemalv/git-practice`, and actually pushes to
it. That is the point — the round trip is the thing you cannot learn from reading.

The practice repo lives inside this folder so everything stays in one place. Override
with `GIT_PRACTICE_DIR=/somewhere/else ./run.sh` if you'd rather it went elsewhere.

| Command | |
|---|---|
| `./run.sh` | walk through it, pausing at each command |
| `./run.sh --auto` | run straight through without pausing |
| `./run.sh clean` | delete the local folder and the GitHub repo (asks first) |
| `./run.sh help` | the summary above |

It checks your setup before it starts and refuses to run if your commit identity is
missing. If the GitHub CLI isn't installed it still does every local part and prints
the two commands you need to connect the repo by hand.

---

## `./deep-dive.sh` — the parts that need their own lesson

Nine standalone lessons in a throwaway `./sandbox`, so you can practise the
dangerous commands somewhere consequence-free:

```bash
./deep-dive.sh list
./deep-dive.sh 4        # the three resets, and recovering with reflog
./deep-dive.sh reset    # wipe the sandbox
```

| # | Lesson |
|---|---|
| 1 | Identity and configuration |
| 2 | Empty folder to first commit, in detail |
| 3 | Undoing safely — `restore`, `commit --amend`, `revert` |
| 4 | The three resets, then rescuing a destroyed commit with `reflog` |
| 5 | Branching, merging, **and a real conflict you resolve by hand** |
| 6 | Rebase, and how it differs from merge |
| 7 | Stash, cherry-pick, tags, clean |
| 8 | Remotes and GitHub, command by command |
| 9 | Reading history — `log`, `show`, `blame`, `bisect` |

Lesson 4 is the one worth doing twice. It destroys a commit with `reset --hard` and
brings it back, so the day you do that by accident you already know the answer.

---

## The mental model everything hangs off

```
  working tree  --git add-->  staging area  --git commit-->  repository
       ^                            ^                             |
       |                            |                             |
       +------ git restore ---------+------ git reset ------------+
```

- `git diff` compares **working tree vs staging**
- `git diff --staged` compares **staging vs last commit** — what you're about to commit
- `git status` tells you where everything currently sits

---

## Credentials

**None of them go in these files.** Git has no login — it stamps a name and email
onto commits, and hands authentication to your operating system.

See **[CREDENTIALS.md](./CREDENTIALS.md)** for the difference between commit identity
and authentication (people conflate them constantly), and the three ways to
authenticate. Short version:

```bash
brew install gh && gh auth login
```

That stores an OAuth token in your Keychain *and* configures Git's credential helper,
and gives you `gh repo create`, which `run.sh` uses.

---

## Corrections to the DataCamp article this was based on

Four commands in it won't run as printed:

| Article | Correct |
|---|---|
| `git config -list` | `git config --list` |
| `git config -global core.editor "code-w"` | `git config --global core.editor "code -w"` |
| `git push ---all origin` | `git push --all origin` |
| `git diff -- cached` | `git diff --cached` |

And it omits the commands that matter most:

- **`git revert`** — the only undo that's safe on a branch others have pulled. It adds
  a commit that reverses an old one instead of rewriting history.
- **`git reflog`** — records every position HEAD has held, for ~90 days, including
  commits no branch points at. Run it *before* you panic.
- **`git push --force-with-lease`** — the article recommends plain `--force`, which
  will silently delete a colleague's work. Same capability, with a seatbelt.
- **`git switch` / `git restore`** — since 2.23 these replace the two unrelated jobs
  `git checkout` was doing.

---

## Three rules worth memorising

1. **Never rewrite history someone else has pulled.** `rebase`, `commit --amend` and
   `push --force` all rewrite. Excellent on your own unpushed branch; an outage on `main`.
2. **`git clean` and `reset --hard` have no undo for uncommitted work.** `reflog` can
   recover *commits*. It cannot recover changes you never committed.
3. **Commit before you experiment.** A commit is free and reversible. An uncommitted
   afternoon is not.
