#!/bin/bash
#
# Stop hook: refuse to end a work session with unfinished git state.
#
# Canonical copy. Claude Code sessions run this from ~/.claude/, which is
# rebuilt when the container restarts -- so a fix applied there evaporates and
# the original comes back. Keeping it here means reinstalling is one command:
#
#   cp scripts/stop-hook-git-check.sh ~/.claude/stop-hook-git-check.sh
#
# and pointing ~/.claude/launcher-settings.json at this path instead makes it
# stick for as long as that file does.
#
# It checks three things and exits 2 with an explanation if any fails:
# uncommitted changes, untracked files, and commits that are local, unsigned,
# or signed under the wrong identity.
#
# Two fixes over the version this project was handed, both of which were
# firing on every single merge:
#
#   1. Squash-merge commits looked local. Both checks compared against
#      origin/<branch>, which goes stale the moment a PR merges: GitHub authors
#      a brand-new commit on main, and resetting the working branch onto it
#      leaves that commit reachable from HEAD but absent from the stale ref. It
#      then reads as unpushed and unsigned when it is neither -- and the remedy
#      the message suggests would mean force-pushing a shared branch to amend
#      somebody else's commit. Both checks now also exclude the remote default
#      branch. Real local work is unaffected: commits written on top of main
#      are not reachable from origin/main, so they still trip both checks.
#
#   2. %G? cannot detect a signature here. It reports the result of *verifying*
#      one, and this environment signs over SSH without setting
#      gpg.ssh.allowedSignersFile -- so git cannot verify its own signatures and
#      returns N, the same value it returns for a genuinely unsigned commit.
#      Every correctly signed commit got flagged, and the --amend it advised
#      produced another commit that failed identically. Presence is now read
#      straight off the commit object's gpgsig header, which needs no
#      verification.

# Read the JSON input from stdin
input=$(cat)

# Check if stop hook is already active (recursion prevention)
stop_hook_active=$(echo "$input" | jq -r '.stop_hook_active')
if [[ "$stop_hook_active" = "true" ]]; then
  exit 0
fi

# Check if we're in a git repository - bail if not
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  exit 0
fi

# Bail if there's no remote to push to. Every error path below asks the user
# to "push to the remote branch" — meaningless without a remote, and
# unsatisfiable if signing also requires a source. This case arises when CCR
# was launched against a local repo with no github remote (sources=[]) and
# the container's cwd has a leftover .git from a cached resume.
if [[ -z "$(git remote)" ]]; then
  exit 0
fi

# Check for uncommitted changes (both staged and unstaged)
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "There are uncommitted changes in the repository. Please commit and push these changes to the remote branch." >&2
  exit 2
fi

# Check for untracked files that might be important
untracked_files=$(git ls-files --others --exclude-standard)
if [[ -n "$untracked_files" ]]; then
  echo "There are untracked files in the repository. Please commit and push these changes to the remote branch." >&2
  exit 2
fi

current_branch=$(git branch --show-current)
if [[ -n "$current_branch" ]]; then
  if git rev-parse "origin/$current_branch" >/dev/null 2>&1; then
    upstream="origin/$current_branch"
  else
    upstream="origin/HEAD"
  fi

  # Anything already published on the remote default branch is out of scope for
  # both checks below. See fix 1 in the header.
  default_ref=$(git symbolic-ref --quiet refs/remotes/origin/HEAD 2>/dev/null)
  if [[ -z "$default_ref" ]]; then
    for candidate in refs/remotes/origin/main refs/remotes/origin/master; do
      if git rev-parse --verify --quiet "$candidate" >/dev/null 2>&1; then
        default_ref="$candidate"
        break
      fi
    done
  fi

  # Duplicate --not refs are harmless to git, so no need to dedupe.
  exclude=("$upstream")
  [[ -n "$default_ref" ]] && exclude+=("$default_ref")

  # Commits GitHub will show as "Unverified": no signature, or a committer
  # email other than noreply@anthropic.com. Signature *presence* comes off the
  # commit object's gpgsig header rather than from %G? -- see fix 2 in the
  # header for why %G? cannot answer this here.
  if [[ "$(git config --type=bool commit.gpgsign 2>/dev/null)" == "true" ]]; then
    unverifiable=""
    while read -r sha email; do
      [[ -z "$sha" ]] && continue
      if [[ "$email" != "noreply@anthropic.com" ]]; then
        unverifiable+="$sha committer $email"$'\n'
      elif ! git cat-file commit "$sha" 2>/dev/null | sed -n '/^$/q;p' | grep -q '^gpgsig'; then
        unverifiable+="$sha unsigned"$'\n'
      fi
    done < <(git log --format='%h %ce' HEAD --not "${exclude[@]}" 2>/dev/null)

    if [[ -n "$unverifiable" ]]; then
      echo "There are commit(s) on branch '$current_branch' that GitHub will show as Unverified (missing signature, or committer email is not noreply@anthropic.com):" >&2
      echo "$unverifiable" >&2
      echo "Please run 'git config user.email noreply@anthropic.com && git config user.name Claude', then 'git commit --amend --no-edit --reset-author' for the tip commit, or 'git rebase --exec \"git commit --amend --no-edit --reset-author\" $upstream' for earlier commits, then push." >&2
      exit 2
    fi
  fi

  unpushed=$(git rev-list --count HEAD --not "${exclude[@]}" 2>/dev/null) || unpushed=0
  if [[ "$unpushed" -gt 0 ]]; then
    if [[ "$upstream" == "origin/$current_branch" ]]; then
      echo "There are $unpushed unpushed commit(s) on branch '$current_branch'. Please push these changes to the remote repository." >&2
    else
      echo "Branch '$current_branch' has $unpushed unpushed commit(s) and no remote branch. Please push these changes to the remote repository." >&2
    fi
    exit 2
  fi
fi

exit 0
