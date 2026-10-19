# Git cheat sheet

## Every day
```bash
git status                      # where is everything
git status --short              # compact: ?? untracked, M modified, A added
git add <file>                  # stage one file (prefer this to 'git add .')
git add -p                      # stage hunk by hunk — the best habit in git
git diff                        # working tree vs staged
git diff --staged               # what you are about to commit
git commit -m "message"
git commit --amend              # rewrite the last commit (local only!)
git log --oneline --graph --decorate --all     # alias this as 'git lg'
```

## Undo, from safest to most destructive
```bash
git restore <file>              # discard working-tree change
git restore --staged <file>     # unstage, keep the edit
git revert <sha>                # new commit that undoes an old one — SAFE on shared branches
git reset --soft HEAD~1         # undo commit, keep changes staged
git reset --mixed HEAD~1        # undo commit, unstage, keep files      (default)
git reset --hard HEAD~1         # undo commit, DELETE changes
git reflog                      # where HEAD has been — recover from the line above
```

## Branching
```bash
git switch -c feature/x         # create + switch      (old: checkout -b)
git switch main                 # switch               (old: checkout)
git branch                      # list
git branch -d name              # delete (refuses if unmerged); -D forces
git merge feature/x             # merge into current branch
git merge --abort               # back out of a conflicted merge
git rebase main                 # replay your commits on top of main
git rebase -i HEAD~3            # squash/reword/reorder before sharing
git cherry-pick <sha>           # copy one commit onto this branch
```

## Conflicts
```bash
git status                      # lists "Unmerged paths"
# edit the file, remove <<<<<<< ======= >>>>>>> markers, keep what you want
git add <file>
git commit                      # completes the merge
```

## Stash
```bash
git stash push -u -m "wip"      # -u includes untracked files
git stash list
git stash pop                   # apply and drop
git stash apply                 # apply and keep
git stash drop
```

## Remotes
```bash
git remote -v
git remote add origin git@github.com:mikemalv/repo.git
git push -u origin main         # -u sets upstream; later just 'git push'
git fetch origin                # download, change nothing — always safe
git log --oneline HEAD..origin/main   # what have they done that I haven't got
git pull                        # = fetch + merge
git pull --rebase               # = fetch + rebase
git push --force-with-lease     # safe force push — NEVER plain --force
git push origin --delete old-branch
git fetch --prune               # clean up stale remote-tracking branches
```

## Inspecting
```bash
git show <sha>                  # one commit in full
git log --stat -3               # which files changed
git log -p -1                   # the patch
git diff <sha1> <sha2> -- path  # compare two points, scoped to a path
git blame <file>                # who last touched each line
git bisect start / good / bad   # binary-search for the commit that broke it
git bisect reset                # always finish with this
```

## Tags
```bash
git tag -a v1.0.0 -m "message"  # annotated — use this for releases
git tag -n                      # list with messages
git push origin v1.0.0          # tags do NOT push automatically
```

## Cleaning
```bash
git clean -n                    # DRY RUN — always run this first
git clean -f                    # delete untracked files (no undo)
git clean -fd                   # ...including directories
```

## Config
```bash
git config --list --show-origin
git config --global user.name "Mike Malveira"
git config --global user.email "mike_malveira@yahoo.com"
git config --global init.defaultBranch main
git config --global core.editor "code -w"
git config --global alias.lg "log --oneline --graph --decorate --all"
```
Scope: `--system` < `--global` < `--local`. Nearest wins.
