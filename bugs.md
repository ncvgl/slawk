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
| 7 | Leave Channel | ❌ Bug #4 |
| 8 | Send Message | ✅ Pass |
| 9 | Message History | ✅ Pass |
| 10 | Typing Indicators | ❌ Bug #8 |
| 11 | File Upload | ⚠️ Partial — Bug #6 |
| 12 | Threads | ✅ Pass (minor Bug #5) |
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
Pinning a message triggers a database `UPDATE` which changes `updatedAt`. The frontend compares `updatedAt > createdAt` to decide whether to show `(edited)`, so every pinned message is incorrectly labeled as edited — even if the text was never changed.

### Root Cause
The "(edited)" check does not distinguish between a content edit and a metadata update (e.g. `isPinned` toggle). The backend should either use a separate `editedAt` field for content edits, or the pin operation should preserve the existing `updatedAt`.

---

## Bug #2 — Emoji reactions stored as shortcodes render as raw text

**Severity:** High
**Feature:** Reactions

### Steps to Reproduce
1. Open any channel that has reactions inserted via the seed script (or the database directly)
2. Observe the reaction badges under those messages

### Expected
Reactions display as Unicode emoji with a count — e.g. `👍 2`, `🔥 1`, `🎉 1`

### Actual
Reactions display as raw shortcode text — e.g. `+1 2`, `fire 1`, `tada1`, `thinking_gl...`, `confetti_ball`

### Note
Reactions **added via the emoji picker in the UI** display correctly because the picker sends the actual Unicode character. The bug only affects reactions stored as shortcode strings. The frontend renders whatever string is in the database without any shortcode → Unicode conversion.

### Root Cause
The reaction display component has no emoji lookup/mapping step. Any reaction stored as a shortcode (`:fire:`, `+1`, etc.) will render as plain text.

---

## Bug #3 — `TypeError` in `fetchDirectMessages` spams the console

**Severity:** Critical
**Feature:** Direct Messages

### Steps to Reproduce
1. Log in as any user
2. Open the browser DevTools console
3. Wait a few seconds

### Expected
No errors; DMs load silently in the background.

### Actual
Hundreds of repeated errors per minute fill the console:

```
Failed to fetch DMs: TypeError: Cannot read properties of undefined (reading 'id')
    at useChannelStore.ts:13   (Array.map callback)
    at fetchDirectMessages (useChannelStore.ts:12)
```

Additionally, `fetchMessages` is polled against channels the user is **not** a member of, producing a second stream of errors:

```
Failed to fetch messages: ApiError: You must be a member of this channel
    at useMessageStore.ts:57
```

Both errors repeat on every polling interval, flooding the console and wasting CPU.

### Root Cause
- `fetchDirectMessages` maps over an API response that can contain `undefined` entries without a null-guard.
- The channel polling loop iterates over **all visible channels** rather than only the channels the user has joined, causing 403 responses for private/unjoined channels.

---

## Bug #4 — Leave channel has no UI entry point

**Severity:** High
**Feature:** Leave Channel

### Steps to Reproduce
1. Log in and join any channel
2. Try to find a "Leave channel" option in the UI — check the channel header dropdown (`˅`), the `⋮` menu, hover actions, right-click on the channel name, etc.

### Expected
A "Leave channel" option accessible from somewhere in the channel UI.

### Actual
No UI element exists anywhere. The feature is completely missing from the interface.

### Note
The backend endpoint `POST /channels/:id/leave` is fully implemented, and the frontend API wrapper `leaveChannel(id)` exists in `src/lib/api.ts` — but **no component calls it**. The plumbing is there; only the UI trigger is missing.

---

## Bug #5 — Thread reply input ignores the Enter key

**Severity:** Low
**Feature:** Threads

### Steps to Reproduce
1. Click "N replies" on any message to open the Thread panel
2. Click the reply input field and type a message
3. Press Enter

### Expected
The reply is sent (consistent with the main message box, which displays the hint "Enter to send, Shift + Enter for new line").

### Actual
Nothing happens on Enter. The user must click the blue send button manually.

### Note
This is a minor inconsistency between the thread reply input (plain `<input>`) and the main Quill-based rich-text editor. The main editor correctly handles Enter-to-send.

---

## Bug #6 — File attachment disappears without sending a message

**Severity:** High
**Feature:** File Upload

### Steps to Reproduce
1. In any channel, click the `+` button in the message composer
2. Select a file — it appears as a badge in the composer (e.g. `qa-test.png ×`)
3. Click the send button

### Expected
A message containing the file attachment appears in the channel.

### Actual
The file is uploaded to the server (`POST /files` returns `201 Created`) and the attachment badge disappears from the composer, but **no message is ever created**. `POST /channels/:id/messages` is never called after the file upload completes.

### Root Cause
The `handleFileSelect` in `MessageInput.tsx` uploads the file immediately on selection and stores the result in `pendingFiles` state. However, the send action does not appear to include `pendingFiles` in the message payload, so the uploaded file ID is silently discarded on send.

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
The "Pins" tab works correctly and opens a right-side panel. The "Files" tab appears to be a stub with no implementation behind it.

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

## Bug #9 — Pinned message has no visual background highlight

**Severity:** Low
**Feature:** Pinned Messages

### Steps to Reproduce
1. Pin any message in a channel
2. View the message in the channel feed

### Expected
The background of a pinned message row should be a light amber/orange (`#FEF9ED`) to visually distinguish it from regular messages.

### Actual
Pinned messages render with the same white background as all other messages. The only pinned indicator is the small orange pin icon/label, which can be easy to miss.

### Root Cause
`Message.tsx` applies a fixed `hover:bg-[#F8F8F8]` class but never conditionally applies a pinned background. The `message.isPinned` flag is available; it just isn't used for background styling.

---

## Bug #10 — Video call button in message composer should be removed

**Severity:** Low
**Feature:** Message Input

### Steps to Reproduce
1. Open any channel
2. Look at the bottom toolbar of the message composer

### Expected
Only controls that have working functionality should appear. Video calls are not supported.

### Actual
A video-camera icon (`Video` from `lucide-react`) is rendered in the composer toolbar. Clicking it does nothing. It creates a misleading affordance.

### Root Cause
`MessageInput.tsx` imports and renders a `<Video>` icon button that has no `onClick` handler and no underlying feature.

---

## Bug #11 — Reaction emoji glyphs render too small inside the pill

**Severity:** Medium
**Feature:** Reactions

### Steps to Reproduce
1. Add any emoji reaction to a message
2. Observe the reaction pill/badge

### Expected
The emoji character and its accompanying count number are comfortably legible — at least `16px` for the glyph and consistent sizing for the count.

### Actual
The emoji `<span>` is constrained to a `w-4 h-4` (16 px) box, which clips or compresses many multi-codepoint emoji. The count number is rendered at `text-[12px]`, making the whole badge feel tiny. Both should be visually larger while the oval pill container itself can stay the same proportions.

### Root Cause
In `MessageReactions.tsx`, the emoji span has `w-4 h-4 flex items-center justify-center` with no explicit `font-size`, and the count uses `font-normal` at the container's default `text-[12px]`.

---

## Bug #12 — Channel star/favorite button has no effect

**Severity:** High
**Feature:** Channel Navigation

### Steps to Reproduce
1. Open any channel
2. Click the ☆ star icon next to the channel name in the header
3. Navigate away and back, or look at the sidebar

### Expected
- Clicking the star toggles a "starred/favorited" state for that channel.
- The star icon fills in (★) to confirm the toggle.
- A **Starred** section appears at the top of the channel list in the sidebar listing all starred channels.
- The state persists across navigation (stored in `localStorage` or the backend).

### Actual
Clicking the star does nothing. No visual feedback, no state change, no sidebar section.

### Root Cause
`MessageHeader.tsx` renders the `<Star>` icon button with no `onClick` handler and no state. The channel store has no `isStarred` field and no `toggleStar` action.

---

## Summary

| Severity | Count | Bugs |
|----------|-------|------|
| Critical | 1 | #3 |
| High | 5 | #2, #4, #6, #8, #12 |
| Medium | 3 | #1, #7, #11 |
| Low | 3 | #5, #9, #10 |
| **Total** | **12** | |

### Recommended Fix Priority
1. **Bug #3** (Critical) — Fix the null-guard crash and the over-broad polling; this generates hundreds of errors per session.
2. **Bug #8** (High) — Add `typing:start`/`typing:stop` emit in `MessageInput.tsx` and a listener + UI indicator.
3. **Bug #6** (High) — Ensure `pendingFiles` IDs are included in the `sendMessage` payload.
4. **Bug #4** (High) — Wire the existing `leaveChannel()` API call to a UI element (e.g. channel header `⋮` menu).
5. **Bug #12** (High) — Implement star/favorite toggle with a Starred section in the sidebar.
6. **Bug #2** (High) — Add a shortcode → Unicode emoji mapping in the reaction display component.
7. **Bug #7** (Medium) — Implement the Files side panel (similar to Pins panel).
8. **Bug #11** (Medium) — Make reaction emoji glyphs and count numbers larger inside the pill.
9. **Bug #1** (Medium) — Use a dedicated `editedAt` field (set only on content edits) instead of `updatedAt`.
10. **Bug #5** (Low) — Add Enter-to-send handling to the thread reply input.
11. **Bug #9** (Low) — Apply `#FEF9ED` background to pinned message rows.
12. **Bug #10** (Low) — Remove the non-functional video call button from the message composer.
