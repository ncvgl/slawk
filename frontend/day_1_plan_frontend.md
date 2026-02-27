😎: Here's the complete frontend master prompt:

---

# Frontend Development Session - Slack Clone (UI-First)

You are building the frontend for an open-source Slack clone. Focus ONLY on visual design first - no backend integration yet.

## Project Overview
- **Goal:** Pixel-perfect Slack UI clone
- **Approach:** UI-first with mock data, no backend connection initially
- **Deployment:** Will be deployed to GCP Cloud Storage + CDN later

## Tech Stack (Already Decided)

### Core
- **Framework:** React 18 + Vite + TypeScript (strict mode)
- **Styling:** TailwindCSS
- **UI Components:** shadcn/ui (copy-paste components)
- **Icons:** Lucide React
- **Routing:** React Router v6
- **State Management:** Zustand (with mock data initially)
- **Forms:** React Hook Form + Zod
- **Date Formatting:** date-fns

### Development
- **Package Manager:** npm
- **Dev Server:** Vite (port 5173)
- **Build Tool:** Vite
- **TypeScript:** Strict mode

## CRITICAL: Browser-Agent Design Extraction

Before building ANY component, use the browser agent to extract Slack's exact design.

### Step 1: Design Extraction (DO THIS FIRST)

```
Use browser agent to:
1. Navigate to https://slack.com/signin (or demo workspace)
2. Take screenshots of:
   - Workspace sidebar (channels list)
   - Message area (with messages)
   - Message composer (bottom input)
   - Login/register pages
   - Hover states
   - Active/selected states
3. Save screenshots to /design-reference/ folder
4. Right-click elements → Inspect → Copy computed CSS
5. Extract:
   - All color values (purple, blue, grays, hover states)
   - Font families and sizes
   - Spacing values (padding, margin, gaps)
   - Border radius values
   - Box shadows
   - Transitions/animations
6. Document everything in design-reference/slack-design-system.md
```

### Step 2: Create Design Tokens

After extraction, create src/styles/tokens.ts with EXACT values:

```typescript
// Extract these values from Slack.com using browser DevTools
export const colors = {
  workspace: {
    bg: '#3f0e40',           // Sidebar background
    hover: '#350d36',        // Sidebar item hover
    active: '#1164a3',       // Active channel
    text: '#ffffff',         // Sidebar text
    textMuted: 'rgba(255,255,255,0.7)',
  },
  message: {
    bg: '#ffffff',
    hover: '#f8f8f8',
    text: '#1d1c1d',
    timestamp: '#616061',
    border: '#e0e0e0',
  },
  composer: {
    bg: '#ffffff',
    border: '#8d8d8d',
    focusBorder: '#1164a3',
  },
  // Add more as you inspect
};

export const spacing = {
  sidebarPadding: '0 16px',
  messagePadding: '8px 20px',
  channelItemHeight: '28px',
  composerPadding: '12px 16px',
  // Add more as you measure
};

export const typography = {
  fontFamily: 'Slack-Lato, Lato, sans-serif', // Or -apple-system fallback
  messageFontSize: '15px',
  channelFontSize: '15px',
  timestampFontSize: '12px',
  // Add more as you inspect
};
```

## Mock Data Strategy

Build with realistic mock data - NO backend calls, NO WebSocket.

### Create Mock Data Files

```typescript
// src/mocks/users.ts
export const mockUsers = [
  { 
    id: 1, 
    name: 'Alice Johnson', 
    email: 'alice@company.com', 
    avatar: 'https://i.pravatar.cc/150?img=1',
    status: 'online'
  },
  { 
    id: 2, 
    name: 'Bob Smith', 
    email: 'bob@company.com', 
    avatar: 'https://i.pravatar.cc/150?img=2',
    status: 'away'
  },
  { 
    id: 3, 
    name: 'Charlie Davis', 
    email: 'charlie@company.com', 
    avatar: 'https://i.pravatar.cc/150?img=3',
    status: 'online'
  },
  // Add 10-15 more users
];

// src/mocks/channels.ts
export const mockChannels = [
  { id: 1, name: 'general', isPrivate: false, memberCount: 50, unreadCount: 0 },
  { id: 2, name: 'random', isPrivate: false, memberCount: 45, unreadCount: 3 },
  { id: 3, name: 'engineering', isPrivate: false, memberCount: 12, unreadCount: 0 },
  { id: 4, name: 'design-team', isPrivate: true, memberCount: 5, unreadCount: 1 },
  { id: 5, name: 'marketing', isPrivate: false, memberCount: 8, unreadCount: 0 },
  // Add 10-15 more channels
];

// src/mocks/messages.ts
import { mockUsers } from './users';

export const mockMessages = [
  {
    id: 1,
    content: 'Hey everyone! Welcome to the team! 🎉',
    userId: 1,
    user: mockUsers[0],
    channelId: 1,
    createdAt: new Date('2026-02-27T10:00:00Z'),
    reactions: [
      { emoji: '👍', count: 5, userIds: [2, 3, 4, 5, 6] },
      { emoji: '🎉', count: 3, userIds: [2, 7, 8] }
    ],
    threadCount: 2
  },
  {
    id: 2,
    content: 'Thanks Alice! Excited to be here 🚀',
    userId: 2,
    user: mockUsers[1],
    channelId: 1,
    createdAt: new Date('2026-02-27T10:05:00Z'),
    reactions: [],
    threadCount: 0
  },
  // Add 30-50 messages for realistic scrolling
  // Include messages from different times (today, yesterday, last week)
];
```

## Project Structure

```
frontend/
├── design-reference/              # Screenshots from Slack
│   ├── slack-sidebar.png
│   ├── slack-messages.png
│   ├── slack-composer.png
│   └── slack-design-system.md     # Documented design tokens
├── src/
│   ├── components/
│   │   ├── Layout/
│   │   │   └── AppLayout.tsx      # Main 3-column layout
│   │   ├── Sidebar/
│   │   │   ├── Sidebar.tsx        # Left sidebar wrapper
│   │   │   ├── WorkspaceHeader.tsx
│   │   │   ├── ChannelList.tsx
│   │   │   └── ChannelItem.tsx
│   │   ├── Messages/
│   │   │   ├── MessageList.tsx    # Scrollable message area
│   │   │   ├── Message.tsx        # Single message
│   │   │   ├── MessageInput.tsx   # Bottom composer
│   │   │   └── MessageReactions.tsx
│   │   ├── Auth/
│   │   │   ├── LoginPage.tsx
│   │   │   └── RegisterPage.tsx
│   │   └── ui/                    # shadcn/ui components
│   ├── mocks/
│   │   ├── users.ts
│   │   ├── channels.ts
│   │   └── messages.ts
│   ├── stores/
│   │   ├── useAuthStore.ts        # Auth state (mock)
│   │   ├── useChannelStore.ts     # Channels + active channel
│   │   └── useMessageStore.ts     # Messages
│   ├── styles/
│   │   ├── tokens.ts              # Design tokens from Slack
│   │   └── globals.css
│   ├── lib/
│   │   └── utils.ts               # Utility functions
│   ├── App.tsx
│   └── main.tsx
├── .env
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

## Features to Build (In Order)

### Phase 1: Setup + Design Extraction
1. Initialize Vite + React + TypeScript
2. Install dependencies (TailwindCSS, shadcn/ui, etc.)
3. Use browser agent to extract Slack's design
4. Create design tokens file
5. Configure Tailwind with Slack's colors

### Phase 2: Authentication Pages (Visual Only)
1. Login page - pixel-perfect match to Slack
2. Register page
3. Forms don't actually work (just UI)

### Phase 3: Main Layout
1. AppLayout - 3-column structure (sidebar, messages, optional thread)
2. Responsive breakpoints (desktop-only for MVP)

### Phase 4: Sidebar
1. Workspace header (name + menu button)
2. Channel list (public channels, private channels, DMs)
3. Channel item (with # icon, name, unread badge)
4. Hover states, active state

### Phase 5: Message Area
1. Message list (scrollable, auto-scroll to bottom)
2. Message component (avatar, name, timestamp, content)
3. Message hover (show reaction button, thread button)
4. Reactions display
5. Loading skeleton screens

### Phase 6: Message Composer
1. Input field (auto-resize textarea)
2. Formatting toolbar (optional for MVP)
3. Send button
4. Keyboard shortcuts (Enter to send, Shift+Enter for newline)

### Phase 7: Polish
1. Loading states (skeleton screens)
2. Empty states ("No messages yet")
3. Smooth transitions
4. Icons from Lucide React

## Development Workflow

### 1. Extract Design from Slack
```
Use browser agent:
- Go to slack.com
- Screenshot each component
- Inspect CSS values
- Document in design-reference/
```

### 2. Build Component
```
Create component matching screenshot
Use extracted design tokens
```

### 3. Compare
```
Use browser agent to screenshot Slack again
Screenshot your component
Compare side-by-side
Adjust CSS until pixel-perfect
```

### 4. Repeat
Continue for all components

## Important Constraints

### What to Build
✅ UI/visual components only
✅ Mock data in Zustand stores
✅ Routing between pages
✅ Hover states, active states
✅ Keyboard shortcuts (Enter to send)
✅ Smooth animations/transitions

### What NOT to Build (Yet)
❌ Real API calls
❌ WebSocket connections
❌ Authentication logic (forms work, but don't validate)
❌ File uploads
❌ Rich text editor (use plain textarea)
❌ Emoji picker (use native OS picker)
❌ Mobile responsive (desktop-only 1024px+)
❌ Dark mode

## Design Decisions Made

- **Icons:** Lucide React
- **Avatars:** pravatar.cc for mock data
- **Dates:** Format with date-fns ("10:24 AM", "Yesterday", "Jan 15")
- **Scroll:** Auto-scroll to bottom on new message
- **Responsive:** Desktop-only for MVP (1024px+ width)
- **Keyboard:** Enter sends, Shift+Enter newline
- **Emoji:** Native (Cmd+Ctrl+Space on Mac)
- **Formatting:** Plain text for MVP
- **Loading:** Skeleton screens (shimmer effect)

## Commands You'll Need

```bash
# Initialize project
npm create vite@latest . -- --template react-ts
npm install

# Install dependencies
npm install react-router-dom zustand date-fns lucide-react

# Install TailwindCSS
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# Install shadcn/ui
npx shadcn-ui@latest init
npx shadcn-ui@latest add button
npx shadcn-ui@latest add input
npx shadcn-ui@latest add avatar
npx shadcn-ui@latest add skeleton

# Start dev server
npm run dev
```

## Testing Approach

Manual visual testing only:
1. Open http://localhost:5173 in browser
2. Click through all pages/views
3. Verify it looks like Slack
4. Test hover states
5. Test keyboard shortcuts
6. Check different screen sizes (desktop only)

No automated tests for MVP.

## Vite Config

Add proxy for future backend integration:

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Will use this later when connecting to backend
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
```

## Your First Task

Start by:
1. Using browser agent to navigate to Slack.com
2. Taking screenshots of the main workspace view
3. Extracting the color palette from DevTools
4. Documenting spacing values
5. Creating design-reference/slack-design-system.md
6. Creating src/styles/tokens.ts with extracted values

Then initialize the Vite project and start building AppLayout.

Begin with: "I'll use the browser agent to analyze Slack's design and extract the design system first."

