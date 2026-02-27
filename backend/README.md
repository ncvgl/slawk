# Slawk Backend

Backend API for Slawk - a self-hosted Slack alternative.

## Tech Stack

- **Runtime:** Node.js 20 LTS + TypeScript
- **Framework:** Express.js
- **Database:** PostgreSQL 15 with Prisma ORM
- **Real-time:** Socket.io
- **Authentication:** JWT + bcrypt
- **Validation:** Zod
- **File Uploads:** Multer

## Quick Start

### Prerequisites

- Node.js 20+
- Docker (for PostgreSQL)

### Setup

1. Start PostgreSQL:
```bash
docker run -d --name slack-postgres -e POSTGRES_PASSWORD=password -e POSTGRES_DB=slackclone -p 5432:5432 postgres:15
```

2. Install dependencies:
```bash
npm install
```

3. Run database migrations:
```bash
npm run db:migrate
```

4. Start development server:
```bash
npm run dev
```

Server runs on http://localhost:3000

## API Endpoints

### Authentication
- `POST /auth/register` - Create user account
- `POST /auth/login` - Login and get JWT token

### Users
- `GET /users/me` - Get current user profile
- `PATCH /users/me` - Update profile (name, avatar, bio)
- `PUT /users/me/status` - Update status (online/away/busy/offline)
- `GET /users/:id` - Get user by ID
- `GET /users` - List/search users

### Channels
- `POST /channels` - Create channel
- `GET /channels` - List all channels
- `GET /channels/:id` - Get channel details
- `POST /channels/:id/join` - Join a channel
- `POST /channels/:id/leave` - Leave a channel
- `GET /channels/:id/members` - List channel members

### Messages
- `POST /channels/:id/messages` - Send message
- `GET /channels/:id/messages` - Get messages (paginated)

### Threads
- `POST /messages/:id/reply` - Reply to message
- `GET /messages/:id/thread` - Get thread messages

### Reactions
- `POST /messages/:id/reactions` - Add reaction (emoji)
- `DELETE /messages/:id/reactions/:emoji` - Remove reaction
- `GET /messages/:id/reactions` - Get reactions (grouped by emoji)

### Files
- `POST /files` - Upload file (multipart/form-data)
- `GET /files` - List user's files
- `GET /files/:id` - Get file info
- `DELETE /files/:id` - Delete file

### Search
- `GET /search?q=query` - Search messages

## WebSocket Events

### Client → Server
- `join:channel` - Join a channel room
- `leave:channel` - Leave a channel room
- `message:send` - Send a message
- `typing:start` - Start typing indicator
- `typing:stop` - Stop typing indicator

### Server → Client
- `message:new` - New message in channel
- `typing:start` - User started typing
- `typing:stop` - User stopped typing
- `error` - Error message

## Scripts

- `npm run dev` - Start development server
- `npm test` - Run tests (68 tests)
- `npm run build` - Build for production
- `npm run db:migrate` - Run database migrations
- `npm run db:studio` - Open Prisma Studio

## Environment Variables

```
DATABASE_URL="postgresql://postgres:password@localhost:5432/slackclone"
JWT_SECRET="your-secret-key-change-in-production"
PORT=3000
NODE_ENV=development
```

## Features

- ✅ Authentication (register/login with JWT)
- ✅ User Profiles (avatar, status, bio)
- ✅ Channels (public/private, join/leave)
- ✅ Messages (send, paginated retrieval)
- ✅ Threads (reply to messages)
- ✅ Reactions (emoji reactions on messages)
- ✅ File Uploads (images, PDFs, etc. up to 10MB)
- ✅ Search (message search across channels)
- ✅ Real-time (WebSocket with Socket.io)
