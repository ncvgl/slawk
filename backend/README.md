# Slawk Backend

Backend API for Slawk - a self-hosted Slack alternative.

## Tech Stack

- **Runtime:** Node.js 20 LTS + TypeScript
- **Framework:** Express.js
- **Database:** PostgreSQL 15 with Prisma ORM
- **Real-time:** Socket.io
- **Authentication:** JWT + bcrypt
- **Validation:** Zod

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
- `npm test` - Run tests
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
