# Slawk Code Review

## Critical (3 issues)

### 1. Download token not scoped to file downloads
**File:** `backend/src/routes/files.ts:239-251`

The 5-minute download JWT can be reused as a general auth token on any endpoint since `authMiddleware` doesn't check the `purpose` claim.

**Fix:** Make `authMiddleware` reject tokens with a `purpose` claim so they cannot be used for general API access:
```ts
const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload & { purpose?: string };
if (decoded.purpose) {
  res.status(401).json({ error: 'Invalid token' });
  return;
}
```

### 2. File attachment TOCTOU race condition
**Files:** `backend/src/websocket/index.ts:166-197`, `backend/src/routes/messages.ts:47-77`

File ownership is validated, then attached in a separate query. Concurrent requests can double-attach the same files.

**Fix:** Use a Prisma `$transaction` to atomically validate and attach:
```ts
await prisma.$transaction(async (tx) => {
  const message = await tx.message.create({ data: { content, userId, channelId, threadId } });
  const updated = await tx.file.updateMany({
    where: { id: { in: fileIds }, userId, messageId: null },
    data: { messageId: message.id },
  });
  if (updated.count !== fileIds.length) {
    throw new Error('Some files were already attached');
  }
  return message;
});
```

### 3. CORS wildcard with credentials
**Files:** `backend/src/app.ts:37`, `backend/src/websocket/index.ts:45`

Falls back to `'*'` in dev, allowing any origin to make credentialed requests.

**Fix:** Default to `http://localhost:5173`:
```ts
const corsOrigin = process.env.CORS_ORIGIN || (process.env.NODE_ENV === 'production' ? false : 'http://localhost:5173');
```

---

## High (5 issues)

### 4. No JWT revocation on logout
**Files:** `backend/src/routes/auth.ts`, `frontend/src/stores/useAuthStore.ts`

Token stays valid for 7 days after logout (only removed from localStorage). No way to invalidate stolen tokens.

**Recommendation:** Implement a token blocklist (Redis or DB), or switch to shorter-lived access tokens with a refresh token flow.

### 5. Unbounded file listing
**File:** `backend/src/routes/channels.ts:441-460`

`GET /channels/:id/files` has no pagination or limit. A channel with thousands of files returns them all.

**Fix:** Add a `take` limit and cursor-based pagination.

### 6. Search uses ILIKE without index
**File:** `backend/src/routes/search.ts:42-44`

Search uses Prisma's `contains` with `mode: 'insensitive'` (translates to `ILIKE '%query%'`), requiring a full table scan. Will degrade as messages grow.

**Recommendation:** Add a `pg_trgm` GIN index on `Message.content` and `DirectMessage.content`, or switch to PostgreSQL full-text search.

### 7. Stale presence on server crash
**File:** `backend/src/websocket/index.ts`

No cleanup of `onlineUsers` map on restart. Users shown as "online" when they are not.

**Fix:** On server startup, reset all users to offline:
```ts
await prisma.user.updateMany({ data: { status: 'offline' } });
```

### 8. Typing indicator leaks email
**File:** `backend/src/websocket/index.ts:315-318`

Both `typing:start` and `dm:typing:start` broadcast the user's `email` to all channel members. Only `userId` and `name` are needed.

---

## Medium (7 issues)

### 9. JWT decoded without verification on frontend hydrate
**File:** `frontend/src/stores/useAuthStore.ts:63-77`

`hydrate()` uses `atob(token.split('.')[1])` without signature verification. Acceptable since it's client-side, but a malformed token could crash `JSON.parse`. The catch block handles it.

### 10. Scheduled message processing not idempotent
**File:** `backend/src/scheduler.ts:52-72`

Message is created first, then scheduled message marked as `sent`. Server crash between these = duplicate message.

**Fix:** Wrap in a transaction with optimistic locking:
```ts
await prisma.$transaction(async (tx) => {
  const claimed = await tx.scheduledMessage.updateMany({
    where: { id: scheduled.id, sent: false },
    data: { sent: true },
  });
  if (claimed.count === 0) return;
  await tx.message.create({ data: { ... } });
});
```

### 11. No pagination cursor validation
**File:** `backend/src/utils/pagination.ts:5`

`parseInt("abc")` returns `NaN`, which would be passed as `cursor` to Prisma.

**Fix:**
```ts
const rawCursor = req.query.cursor ? parseInt(req.query.cursor as string) : undefined;
const cursor = rawCursor !== undefined && !isNaN(rawCursor) && rawCursor > 0 ? rawCursor : undefined;
```

### 12. `container.innerHTML = ''` in emoji picker
**File:** `frontend/src/components/ui/emoji-picker.tsx:43`

Bypasses React's DOM management. Low risk but could be cleaner.

### 13. Missing Content-Length on file downloads
**File:** `backend/src/routes/files.ts:296`

Browsers cannot show download progress without it. `file.size` is available in the DB.

**Fix:** Add `res.setHeader('Content-Length', file.size);` before `createReadStream`.

### 14. `getSharedUsers` query can be expensive
**File:** `backend/src/websocket/index.ts:26-39`

Joins `ChannelMember` with itself and unions with `DirectMessage`. Runs on every connect/disconnect. Could be slow for highly-connected users.

### 15. Validation inconsistency between REST and WebSocket
**Files:** `backend/src/routes/messages.ts:13-26`, `backend/src/websocket/index.ts`

REST validates whitespace-only and null-byte messages. WebSocket does not.

**Fix:** Add the same refinements to `wsMessageSendSchema`:
```ts
content: z.string().min(1).max(4000)
  .refine(val => val.trim().length > 0, { message: 'Content cannot be empty' })
  .refine(val => !val.includes('\u0000'), { message: 'Content cannot contain null bytes' }),
```

---

## Low (7 issues)

### 16. No connection pool configuration for Prisma
**File:** `backend/src/db.ts`

Default pool size is ~5 connections. May be exhausted under WebSocket load.

### 17. console.log instead of structured logging
Throughout the backend. No log levels, no structured output, no verbosity control.

### 18. Missing index on ChannelRead.lastReadMessageId
**File:** `backend/prisma/schema.prisma:147-158`

Could help the unread count query in `GET /channels`.

### 19. No rate limiting on WebSocket events
**File:** `backend/src/websocket/index.ts`

REST endpoints have rate limiting, WebSocket events do not. A malicious client could flood the server.

### 20. No global 401 handler in frontend API client
**File:** `frontend/src/lib/api.ts:71-89`

Expired JWT mid-session gives opaque errors instead of redirecting to login.

**Fix:**
```ts
if (res.status === 401) {
  localStorage.removeItem('token');
  window.location.href = '/login';
}
```

### 21. DM search compounds slow ILIKE scans
**File:** `backend/src/routes/search.ts:93`

Compounds issue #6 for users with many DMs.

### 22. Bookmarks endpoint not paginated
**File:** `backend/src/routes/bookmarks.ts:63-95`

Returns all bookmarks with full message includes.

---

## Summary

| Severity | Count | Key Themes |
|----------|-------|------------|
| Critical | 3 | Token scope escape, TOCTOU race condition, CORS wildcard |
| High | 5 | No token revocation, unbounded queries, stale presence, email leak |
| Medium | 7 | Non-idempotent scheduler, validation inconsistency, missing headers |
| Low | 7 | Connection pooling, logging, pagination gaps, WebSocket rate limits |

**Priority:** Fix #2 (download token scope), #3 (TOCTOU race), and #15 (WebSocket validation gap) first -- these are active security and data integrity risks.
