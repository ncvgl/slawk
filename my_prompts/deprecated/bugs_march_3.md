

# 🐛 Slawk Bug Report - UI/UX Issues

**Testing Date:** March 3, 2026  
**Reference:** Compare all behaviors with actual Slack (slack.com)

---

## 📝 Text Input Modal Issues

### Bug #1: Formatting Toolbar Position ❌
**Current Behavior:** Bold/Italic/Strikethrough toolbar appears BELOW the text input box  
**Expected Behavior:** Toolbar should appear INSIDE the input box at the top (like Slack's toolbar that appears when you click in)  
**Severity:** Medium  
**Reference:** Open Slack, click in message box, observe toolbar position

---

### Bug #2: Input Box Selection Styling ❌
**Current Behavior:** When clicking in the text box, a blue outline appears around it  
**Expected Behavior:** No visual outline change when selecting the text box. Only the formatting toolbar should become active/visible  
**Severity:** Low  
**Reference:** Open Slack, click in message box, observe no blue outline appears

---

### Bug #3: Missing Code Formatting Features ❌
**Current Behavior:** Code and Code Block formatting buttons are missing from the toolbar  
**Expected Behavior:**  
- Add "Code" button (inline code formatting)
- Add "Code Block" button (multi-line code formatting)
- Both should ACTUALLY format the text (like ```code``` in Slack)
- Must be tested and functional

**Severity:** High  
**Reference:** Open Slack message box, see code/code block buttons in toolbar

---

### Bug #4: Unsupported Feature Icons Present ❌
**Current Behavior:** Microphone and Mention icons are visible in the text modal  
**Expected Behavior:** Remove these icons entirely (features not supported):
- ❌ Microphone icon (voice messages not supported)
- ❌ Mention/@ icon (mentions not supported)

**Severity:** Medium  
**Note:** Only show icons for features we actually support

---

### Bug #5: Add Link Modal Styling ❌
**Current Behavior:** When adding a URL, a basic sub-modal appears for URL entry  
**Expected Behavior:** Should open a styled modal matching Slack's design:
- Header says "Add link"
- Proper styling/layout matching Slack's link modal
- Reference Slack's exact design

**Severity:** Low  
**Reference:** Open Slack, click link button in message box, observe the modal

---

### Bug #6: Missing Schedule Message Feature ❌
**Current Behavior:** No schedule message option in text modal  
**Expected Behavior:**  
- Add "Schedule message for later" button/feature
- Must be FULLY FUNCTIONAL (both frontend + backend)
- Should allow selecting date/time to send message later
- Follow Slack's scheduling UI/UX

**Severity:** High  
**Reference:** Open Slack message box, find schedule send option

---

### Bug #7: File Upload Button Missing ❌
**Current Behavior:** Unclear if "+" button exists or works correctly  
**Expected Behavior:**  
- "+" button should be present in text modal
- Clicking it should open file picker to upload from computer
- Should support all file types (images, documents, etc.)

**Severity:** High  
**Reference:** Open Slack, click "+" to upload files

---

## 📌 Pin Messages Issues

### Bug #8: Pinned Messages Not Updating in Real-Time ❌
**Current Behavior:**  
- User pins a message → nothing happens in UI
- After page refresh → pinned message appears in pins header
- Backend IS saving the pin (confirmed)

**Expected Behavior:**  
- Pin a message → immediately appears in "Pins" header/panel
- No page refresh required
- Real-time update

**Severity:** High  
**Issue Type:** Frontend state management issue (backend works)

---

## 📁 Files Issues

### Bug #9: Files Header Not Showing Uploaded Files ❌
**Current Behavior:** Files header exists but doesn't show uploaded files when clicked  
**Expected Behavior:**  
- Click "Files" header in chat → opens side panel
- Shows ALL files uploaded in that channel/DM
- Same behavior as "Pins" header (side panel opens with content)
- Should update in real-time when new files uploaded

**Severity:** High  
**Reference:** Open Slack, click "Files" in channel header

---

### Bug #10: Unnecessary Headers in Chat ❌
**Current Behavior:** "Messages" header and "+" button after pins are present  
**Expected Behavior:**  
- ❌ Remove "Messages" header (redundant - messages always visible)
- ❌ Remove "+" button after pins header

**Severity:** Low  
**Note:** Keep only "Pins" and "Files" headers in channel view

---

### Bug #11: Left Sidebar Files Section Not Functional ❌
**Current Behavior:** "Files" icon in leftmost sidebar exists but unclear if functional  
**Expected Behavior:**  
- Click "Files" in left sidebar → opens panel showing ALL files user ever uploaded
- Include files from: all channels, all DMs, all contexts
- Sort by upload date (most recent first)
- Use Slack's design system (don't need full complexity, just file list view)

**Severity:** High  
**Reference:** Open Slack, click "Files" in left sidebar, observe layout

---

## 👥 Channel Header Issues

### Bug #12: Missing User Avatars in Channel Header ❌
**Current Behavior:** Channel header shows member count (e.g., "10") with generic people icons  
**Expected Behavior:**  
- Show member count number
- Display up to 3 user avatars of channel members
- Use actual profile photos, not generic icons
- Match Slack's design

**Severity:** Medium  
**Reference:** Open Slack channel, see member count with avatars in header

---

## 💬 Direct Messages Issues

### Bug #13: DM Chat Missing Pins/Files Headers ❌
**Current Behavior:** In 1-on-1 DMs, only person's name is shown in chat header  
**Expected Behavior:**  
- Add "Pins" header (same as channels)
- Add "Files" header (same as channels)
- Same functionality as channel pins/files

**Severity:** Medium  
**Reference:** Open Slack DM, see pins/files headers present

---

## 👤 Profile Modal Issues

### Bug #14: Email Missing from Profile Modal ❌
**Current Behavior:** User email is not shown in profile modal  
**Expected Behavior:**  
- Display user's email address in profile modal
- Should show when viewing ANY user's profile (not just your own)

**Severity:** Medium  
**Note:** Email was previously removed but should be restored  
**Reference:** Open Slack, click any user's profile, see email displayed

---

## 🖼️ Image Upload Issues

### Bug #15: Image Opens in New Tab Instead of Modal ❌
**Current Behavior:** Clicking an uploaded image opens it in a new browser tab  
**Expected Behavior:**  
- Click image → opens modal/lightbox WITHIN Slack (same tab)
- Modal should have close button (X)
- Can navigate between images if multiple
- No new tab/window created

**Severity:** Medium  
**Reference:** Open Slack, click uploaded image, observe modal behavior

---

## 🏠 Left Sidebar Issues

### Bug #16: Unnecessary Home Icon ❌
**Current Behavior:** "Home" icon/logo present in leftmost sidebar  
**Expected Behavior:**  
- ❌ Remove "Home" icon (not needed for MVP)
- ✅ Keep only: "DMs" and "Files" in leftmost sidebar

**Severity:** Low

---

## 📋 Summary Stats

- **Total Bugs:** 16
- **High Severity:** 7 bugs
- **Medium Severity:** 7 bugs  
- **Low Severity:** 2 bugs

---

## 🎯 Priority Order (Suggested)

**Phase 1 - Critical (Do First):**
1. Bug #3 - Code formatting
2. Bug #6 - Schedule message
3. Bug #7 - File upload button
4. Bug #8 - Pin real-time updates
5. Bug #9 - Files header functionality
6. Bug #11 - Left sidebar files

**Phase 2 - Important:**
7. Bug #1 - Toolbar position
8. Bug #4 - Remove unsupported icons
9. Bug #12 - User avatars
10. Bug #13 - DM pins/files headers
11. Bug #15 - Image modal

**Phase 3 - Polish:**
12. Bug #2 - Input box styling
13. Bug #5 - Link modal styling
14. Bug #10 - Remove unnecessary headers
15. Bug #14 - Profile email
16. Bug #16 - Remove home icon

---

## 🔧 Instructions for Developer Agent

**IMPORTANT REMINDERS:**

1. **Always reference real Slack** - Open slack.com and compare behavior for ANY unclear requirements
2. **Test all features** - After implementing, manually test each fix
3. **Real-time updates** - All UI changes (pins, files, messages) must update immediately without page refresh
4. **Design system consistency** - Match Slack's visual design (spacing, colors, layout)
5. **Remove unsupported features** - Don't show UI for features we don't support (microphone, mentions, etc.)

**For each bug fix:**
- ✅ Implement the fix
- ✅ Test manually in browser
- ✅ Verify real-time updates work (if applicable)
- ✅ Compare with real Slack to confirm match
- ✅ Commit with message: "fix: Bug #X - [description]"

**Need clarification?** Open slack.com and observe the actual behavior!


