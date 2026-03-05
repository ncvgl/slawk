 **Bug List for Claude Code:**

1. **@Mention functionality broken**
   - Shows avatars without pictures
   - Clicking doesn't work fluidly
   - Pressing Enter doesn't properly insert mention
   - Clicking on mention doesn't show profile (should show like Slack)

2. **Microphone feature not working**
   - Click microphone button → nothing happens
   - Should start voice recording

3. **File upload fails**
   - Every file upload attempt fails with error

4. **Avatar and font sizing inconsistencies**
   - Avatar sizes might differ from Slack
   - Font sizes might differ from Slack
   - Overall dimensions don't match Slack
   - Need pixel-perfect comparison with Slack

5. **Missing SSO authentication**
   - Need "Sign in with Google"
   - Need "Sign in with GitHub"

6. **Saved messages - no UI to access**
   - Messages can be saved but no way to view them
   - Check Slack to see where saved messages appear

7. **Scheduled messages - no management UI**
   - No place to view scheduled messages
   - No way to edit scheduled messages
   - Check Slack's scheduled message management

8. **Online status shows incorrectly**
   - Shows users as online when they're not
   - Happens with non-existent users

9. **Unauthenticated routing broken**
   - Visit any URL while logged out → shows "can't get token" error
   - Should redirect to /login page instead

10. **Browse channels - clicking doesn't work**
    - Click on channel in browse modal → nothing happens
    - Should navigate to that channel

11. **Search bar - no live results**
    - Must press Enter to see results
    - Should show results as you type (like Slack)

12. **Thread replies show wrong avatars**
    - Shows thread owner's avatar instead of reply author's avatar
    - Each reply should show the avatar of who wrote it

13. **Text formatting doesn't persist**
    - Apply bold/italic/formatting in text box → shows formatted
    - Press Enter to send → formatting is lost
    - Message sent as plain text without formatting


