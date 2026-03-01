# Slawk QA Bug Report

**Test Environment:** `http://localhost:5173`
**Tester:** Alice Nguyen (`alice@slawk.dev`)
**Date:** March 1, 2026
**Test data:** Populated via `npm run db:seed` (8 users, 6 channels, 86 messages, reactions, DMs)

---

## Feature Coverage

| # | Feature | Status |
|---|---------|--------|
| 1 | Register | ✅ Pass |
| 2 | Login / Logout | ✅ Pass |
| 3 | Online Presence | ✅ Pass |
| 4 | Create Channel | ✅ Pass |
| 5 | Browse Channels | ✅ Pass |
| 6 | Join Channel | ✅ Pass |
| 7 | Leave Channel | ✅ Pass |
| 8 | Send Message | ✅ Pass |
| 9 | Message History | ✅ Pass |
| 10 | Typing Indicators | ❌ Bug #8 |
| 11 | File Upload | ✅ Pass |
| 12 | Threads | ✅ Pass |
| 13 | Search | ✅ Pass |
| 14 | Pinned Messages | ⚠️ Partial — Bug #1 |

---

## Bug #1 — Pinned messages falsely show "(edited)" label

**Severity:** Medium
**Feature:** Pinned Messages

### Steps to Reproduce
1. Pin any message (via the UI pin button or the seed data)
2. View that message in the channel

### Expected
Only messages whose **content** was modified should display the `(edited)` badge.

### Actual
Pinning a message triggers a database `UPDATE` which changes `updatedAt`. The frontend (`src/lib/api.ts:46`) computes `isEdited: msg.updatedAt !== msg.createdAt`, so every pinned message is incorrectly labeled as edited — even if the text was never changed.

### Root Cause
`api.ts` derives `isEdited` by comparing `updatedAt` vs `createdAt`. The backend should either use a separate `editedAt` field set only on content edits, or the pin operation should preserve the existing `updatedAt`.

---

## Bug #7 — "Files" tab in the channel header does nothing

**Severity:** Medium
**Feature:** File Upload / Channel Navigation

### Steps to Reproduce
1. Open any channel
2. Click the **Files** tab in the channel header (between "Messages" and "Pins")

### Expected
A panel or filtered view listing files shared in the channel — similar to how clicking **Pins** opens the "Pinned messages" side panel.

### Actual
Clicking "Files" has no visible effect. The main message view is unchanged and no files panel appears.

### Note
The "Pins" tab works correctly and opens a right-side panel. The "Files" tab only sets `activeTab` state in `MessageHeader.tsx` with no `onToggleFiles` prop or panel component behind it.

---

## Bug #8 — Typing indicators not implemented in the frontend

**Severity:** High
**Feature:** Typing Indicators

### Steps to Reproduce
1. Open the same channel in two separate browser sessions (e.g. Alice + Bob)
2. Start typing in one session
3. Observe the other session for a typing indicator

### Expected
An indicator such as "Alice is typing…" appears for other users in the channel.

### Actual
No typing indicator ever appears. The feature is entirely absent from the UI.

### Root Cause
The **backend** fully implements the socket events:
- `typing:start` / `typing:stop` (channel typing)
- `dm:typing:start` / `dm:typing:stop` (DM typing)

The **frontend** does neither:
- `MessageInput.tsx` never emits `typing:start` or `typing:stop` when the user types
- No component listens for these events to render an indicator

The feature is 0% implemented on the frontend side.

---

## Summary

| Severity | Count | Bugs |
|----------|-------|------|
| High | 1 | #8 |
| Medium | 2 | #1, #7 |
| **Total** | **3** | |

### Remaining Fix Priority
1. **Bug #8** (High) — Add `typing:start`/`typing:stop` emit in `MessageInput.tsx` and a listener + UI indicator.
2. **Bug #7** (Medium) — Implement the Files side panel (similar to Pins panel).
3. **Bug #1** (Medium) — Use a dedicated `editedAt` field (set only on content edits) instead of `updatedAt`.
