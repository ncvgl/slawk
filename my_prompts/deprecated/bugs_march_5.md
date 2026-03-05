# Bugs & Issues — March 5, 2026

## 1. DM sidebar avatars not showing
Teammates in the Direct Messages sidebar don't show their profile photos. May be a seed data issue (photos not seeded for those users) or a frontend bug.

## 2. Clicking user profile doesn't work
Cannot click on a user's name/avatar to view their profile. The profile panel doesn't open.

## 3. DM online status inconsistency
Users show as offline (gray dot) in the DM sidebar, but when you open the conversation, they show a green online dot next to their name in the header. Status should be consistent.

## 4. Star button on DMs — check if needed
The star icon appears on DM conversations. Compare with real Slack to see if starring DMs is a feature. If not, remove the star button from DM headers.

## 5. Rename "Later" to "Saved"
The sidebar nav item and the saved messages page header should say "Saved" instead of "Later".

## 6. Saved page bookmark icon should look filled/yellow
On the Saved page, the remove-bookmark button looks the same as the "save" button. It should appear filled/yellow (like the active saved state) so users understand clicking it will un-save the message.

## 7. No way to add people to a channel after creating it
After creating a channel, there's no UI to invite/add members. Check how Slack handles this (usually a prompt after creation or an "Add people" option in channel settings).

## 8. No public vs private channel distinction
Channel creation has no option for public or private. Public channels should be browsable and joinable by anyone. Private channels should not appear in browse and require an invite.

## 9. Remove workspace dropdown menu (redundant)
The "Slawk" dropdown at the top of the sidebar shows Profile and Sign Out, but these are already available from the avatar menu at the bottom left. Remove the dropdown — just show "Slawk" as plain text with no chevron/click behavior.

## 10. Channel header member avatars — shape and alignment broken
The small member avatars in the channel header have become round instead of square, and the first one is misaligned (slightly above the others). They used to look correct. Fix the shape back to rounded-square and fix vertical alignment.

## 11. Channel name click opens members panel — remove
Clicking the channel name opens the members panel, same as clicking the member avatars. Remove the members panel toggle from the channel name click — there should be only one way to open it (the member avatars button).

## 12. Ordered lists not rendering after send
Typing a numbered list (1. 2. 3.) in the composer formats it correctly, but after sending, the message loses the numbered list formatting and shows plain text.

## 13. Bullet lists not rendering after send
Same as above but for unordered/bullet lists — formatting is lost after sending.

## 14. Code inline formatting inconsistent before/after send
Inline code formatting looks different in the composer vs in the sent message. It should look identical.

## 15. Code block formatting inconsistent before/after send
Code blocks are almost correct but don't look exactly the same in the composer vs the sent message. They should match exactly.

## 16. Blockquote formatting inconsistent before/after send
Blockquotes look different before and after sending. Should match exactly.

## 17. Clicking a @mention should open user profile
When a @mention appears in a sent message, clicking the mentioned user's name should open their profile panel. Currently nothing happens.

## 18. File attachment needs a proper thumbnail/avatar card
Uploaded files in messages don't show a nice file card with an icon/thumbnail. Check how Slack renders file attachments — should have a file type icon, filename, and size in a styled card.

## 19. Microphone button is missing
The microphone button for voice messages was removed but should be present (even if non-functional, as a placeholder).

## 20. Invalid URL paths show blank page instead of redirecting
Typing a random path like `/slug.html` after the domain shows a blank page. It should redirect to the base URL / default channel.

## 21. File preview should open in a modal, not a new tab
Clicking a file in the Files sidebar opens it in a new browser tab. Instead, it should open in an in-app modal/lightbox overlay showing the image preview.

## 22. Browse channels — clicking should preview, not auto-join
In the browse channels dialog, clicking a public channel that you haven't joined automatically joins it. Instead, clicking should show a preview of the channel (messages visible, no text input) with a "Join" button at the bottom. Only clicking "Join" should add you to the channel.

## 23. Thread reply avatars show wrong user
When replying to a thread, the reply count indicator shows the avatar of the thread's original author instead of the avatars of the people who actually replied.

## 24. Add "Mark as unread" option for messages
Add an "Unread" action to the message hover toolbar / context menu. When triggered, it should mark the channel as having unread messages and show the unread badge next to the channel in the sidebar.
