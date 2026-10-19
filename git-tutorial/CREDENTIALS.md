# Where your credentials actually go

**Short answer: nowhere in this tutorial.** No file in `git-tutorial/` contains or
should ever contain a password, token or key. `run.sh` never asks for credentials
and never stores them.

That is not a limitation — it is how Git works. Git has no concept of a login. It
stamps whatever name and email you configured onto commits, and when it needs to
talk to GitHub it hands the job to your operating system's credential storage.

Run `./run.sh setup` and it will check all four pieces below and tell you which
ones are missing.

---

## The two things people confuse

| | What it is | Where it lives |
|---|---|---|
| **Commit identity** | The name and email written into each commit. A label, not a login. Anyone can type anything here. | `~/.gitconfig`, via `git config --global` |
| **Authentication** | Proof to GitHub that you are `mikemalv` and may push. | SSH key, or a token in the macOS Keychain |

Setting your commit email does not log you in. Logging in does not set your commit
email. You need both, and they need to agree — GitHub links a commit to your profile
by matching the commit's email against the verified emails on your account.

```bash
git config --global user.name  "Mike Malveira"
git config --global user.email "mike_malveira@yahoo.com"
```

If that email is not verified on your GitHub account, your pushed commits will show
an anonymous author with no avatar and will not appear on your contribution graph.
Check at **github.com/settings/emails**.

---

## Pick one authentication method

### Option 1 — GitHub CLI (easiest, recommended)

```bash
brew install gh
gh auth login          # choose GitHub.com -> HTTPS -> login with a web browser
gh auth status         # confirm it says: Logged in to github.com as mikemalv
```

`gh auth login` opens a browser, you approve, and it stores an OAuth token in the
macOS Keychain *and* configures Git's credential helper to use it. After this, `git
push` and `git pull` over HTTPS just work, and you also get `gh repo create`, which
is the fastest way to start lesson 8.

### Option 2 — SSH key

```bash
ssh-keygen -t ed25519 -C "mike_malveira@yahoo.com"     # Enter through the prompts
ssh-add --apple-use-keychain ~/.ssh/id_ed25519         # load it, remember in Keychain
gh ssh-key add ~/.ssh/id_ed25519.pub --title "MacBook Air"
```

No `gh`? Then `cat ~/.ssh/id_ed25519.pub`, copy the output, and paste it at
**github.com/settings/keys**. Never share the file *without* `.pub` — that is the
private half.

Test it:

```bash
ssh -T git@github.com
# Expected: "Hi mikemalv! You've successfully authenticated,
#            but GitHub does not provide shell access."
```

That message is a success, despite sounding like a refusal.

With SSH you use `git@github.com:mikemalv/repo.git` style URLs.

### Option 3 — Personal Access Token over HTTPS

Only if the first two are unavailable. GitHub removed password authentication in
2021, so an HTTPS push asks for a token instead.

1. **github.com/settings/tokens** → Fine-grained tokens → Generate new token
2. Scope it to the single repository, give it **Contents: Read and write**, set a
   short expiry
3. Tell Git where to keep it, then push once and paste the token when prompted:

```bash
git config --global credential.helper osxkeychain
git push        # Username: mikemalv    Password: <paste the token>
```

The Keychain stores it and you are not asked again.

**Never** put a token in a URL like `https://mikemalv:ghp_xxx@github.com/...`. That
writes the secret into `.git/config` in plain text, and into your shell history.

---

## Which URL style am I using?

```bash
git remote -v
```

- `git@github.com:mikemalv/repo.git` → SSH (Option 2)
- `https://github.com/mikemalv/repo.git` → HTTPS (Options 1 or 3)

To switch an existing repo:

```bash
git remote set-url origin git@github.com:mikemalv/repo.git
```

---

## Making lesson 8 real

Once `./run.sh setup` is clean:

```bash
cd ~/Interview_Prep/git-tutorial/sandbox
gh repo create mikemalv/git-practice --private --source=. --remote=origin --push
```

One command: creates the repo under your account, wires up `origin`, and pushes.
Then work through `./run.sh 8` against it.

Keep it **private**, and delete it when you are finished — it exists so you have
somewhere consequence-free to practise `--force-with-lease`.

```bash
gh repo delete mikemalv/git-practice --yes
```

---

## Three rules

1. **Credentials never go in a repository.** Not in a script, not in `.env`, not in
   a config file you commit. If one ever does get committed and pushed, treat it as
   leaked: rotate the secret first, then worry about scrubbing history.
2. **Use short-lived, narrowly-scoped tokens.** A fine-grained token limited to one
   repo with a 30-day expiry is a much smaller problem than a classic token with
   full account access and no expiry.
3. **`.gitignore` is not protection.** It stops files being *added*. It does nothing
   about files already tracked, and nothing about a secret you `git add -f`.
