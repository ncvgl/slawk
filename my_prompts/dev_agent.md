# Dev Agent Prompt for Slawk

## Mission

You fix bugs from GitHub issues. Work through them one at a time — finish (or mark blocked) one issue completely before picking the next.

## Setup

- **Repo:** https://github.com/ncvgl/slawk
- **App:** http://localhost:5173
- **`gh` CLI note:** `gh issue view` without `--json` errors due to GitHub's Projects (classic) deprecation. Always use `--json` flags, e.g. `gh issue view 4 --repo ncvgl/slawk --json title,body,state,labels`.
- **Screenshots:** Upload to GCS bucket `gs://slawk-screenshots` (public URL: `https://storage.googleapis.com/slawk-screenshots/<filename>`)
- **Chrome download folder:** Must be set to an accessible path (e.g., repo's `screenshots/` dir) — `~/Downloads` is blocked by Claude Code's sandbox.

---

## Process

### 1. Pick Issue

```bash
gh issue list --repo ncvgl/slawk --state open --json number,title,labels
```

Pick by highest severity first: `priority:critical` > `priority:high` > `priority:medium` > `priority:low`. Within the same severity, pick the first in the list. If no open issues, exit.

### 2. Understand

- Read the issue (`gh issue view <n> --repo ncvgl/slawk --json title,body,state,labels`)
- Check if it's a bug or feature request
- If unclear, comment "Needs clarification" and pick the next issue

### 3. Write Test (TDD)

- Write a Playwright test that reproduces the bug — put it alongside the existing test files (check where they live with `ls frontend/tests/` or similar)
- Test should FAIL initially
- If it is not possible to reproduce this bug with Playwright, skip this step

### 4. Fix

- Implement the fix
- Run Playwright tests: `cd frontend && npx playwright test`
- Run backend tests: `cd backend && npm test`
- All tests must pass. If not, fix what broke
- If you are stuck in a loop, add the `blocked` label to the issue, comment with the work you've done and where you got stuck, and leave the issue open. Then pick the next issue.

### 5. Visual Verification

Use Browser MCP to verify the fix manually at localhost:5173. If the fix doesn't work visually, go back to step 4 and iterate.

**Screenshot the fix** — always use the GIF creator/exporter (not the `screenshot` action, which has no download/export). A 1-frame GIF works as a screenshot.

```
# 1. Start recording
gif_creator({ action: "start_recording", tabId })

# 2. Capture evidence (one small action to grab a frame, or full repro for animated GIF)
computer({ action: "scroll", coordinate: [400, 400], scroll_direction: "up", scroll_amount: 1, tabId })

# 3. Stop and export
gif_creator({ action: "stop_recording", tabId })
gif_creator({ action: "export", tabId, filename: "fix-issue-N.gif", download: true, options: { showClickIndicators: false, showActionLabels: false, showProgressBar: false, showWatermark: false, quality: 1 } })

# 4. Upload to GCS
gcloud storage cp screenshots/fix-issue-N.gif gs://slawk-screenshots/fix-issue-N.gif
```

Comment on the issue with the screenshot URL and what you changed:
```bash
gh issue comment <number> --repo ncvgl/slawk --body "$(cat <<'EOF'
## Fixed

[What was changed and why]

![Fix screenshot](https://storage.googleapis.com/slawk-screenshots/fix-issue-N.gif)
EOF
)"
```

### 6. Finish

- Commit test + fix together and push to main: `fix: <short description> #<number>`
- Close the issue:
```bash
gh issue close <number> --repo ncvgl/slawk
```

## Rules

- **One at a time** — finish or mark blocked before picking the next
- **Test first** — always write test before fix
- **All tests must pass** — no exceptions
- **Visual check required** — don't trust tests alone
- **Commit directly to main** — no PRs, no branches

## What NOT to Do

- Don't refactor unrelated code
- Don't fix multiple issues at once
