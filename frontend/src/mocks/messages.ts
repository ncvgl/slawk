import { mockUsers, type User } from './users';

export interface Reaction {
  emoji: string;
  count: number;
  userIds: number[];
}

export interface Message {
  id: number;
  content: string;
  userId: number;
  user: User;
  channelId: number;
  createdAt: Date;
  updatedAt?: Date;
  reactions: Reaction[];
  threadCount: number;
  threadLastReplyAt?: Date;
  isEdited?: boolean;
}

// Helper to create dates relative to now
const daysAgo = (days: number, hours = 0, minutes = 0): Date => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hours, minutes, 0, 0);
  return date;
};

const today = (hours: number, minutes: number): Date => {
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
};

export const mockMessages: Message[] = [
  // General channel messages
  {
    id: 1,
    content: 'Hey everyone! Welcome to the team! We are excited to have you all here.',
    userId: 1,
    user: mockUsers[0],
    channelId: 1,
    createdAt: daysAgo(3, 9, 0),
    reactions: [
      { emoji: '👋', count: 8, userIds: [2, 3, 4, 5, 6, 7, 8, 9] },
      { emoji: '🎉', count: 5, userIds: [2, 3, 7, 8, 10] },
    ],
    threadCount: 3,
    threadLastReplyAt: daysAgo(3, 10, 30),
  },
  {
    id: 2,
    content: 'Thanks Alice! Really excited to be here and looking forward to working with everyone.',
    userId: 2,
    user: mockUsers[1],
    channelId: 1,
    createdAt: daysAgo(3, 9, 15),
    reactions: [{ emoji: '👍', count: 3, userIds: [1, 3, 4] }],
    threadCount: 0,
  },
  {
    id: 3,
    content: "Don't forget about the all-hands meeting tomorrow at 10 AM PST. We'll be discussing Q2 goals and introducing new team members.",
    userId: 4,
    user: mockUsers[3],
    channelId: 1,
    createdAt: daysAgo(2, 14, 0),
    reactions: [{ emoji: '✅', count: 12, userIds: [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 4] }],
    threadCount: 5,
    threadLastReplyAt: daysAgo(2, 16, 45),
  },
  {
    id: 4,
    content: 'Has anyone seen the new design mockups? They look amazing!',
    userId: 5,
    user: mockUsers[4],
    channelId: 1,
    createdAt: daysAgo(1, 11, 30),
    reactions: [
      { emoji: '👀', count: 4, userIds: [1, 2, 3, 6] },
      { emoji: '💯', count: 2, userIds: [1, 7] },
    ],
    threadCount: 2,
    threadLastReplyAt: daysAgo(1, 12, 0),
  },
  {
    id: 5,
    content: 'Quick reminder: Please update your Slack profiles with your role and department if you haven\'t already.',
    userId: 1,
    user: mockUsers[0],
    channelId: 1,
    createdAt: daysAgo(1, 15, 0),
    reactions: [{ emoji: '👍', count: 6, userIds: [2, 3, 4, 5, 6, 7] }],
    threadCount: 0,
  },
  {
    id: 6,
    content: 'Good morning everyone! Hope you all had a great weekend.',
    userId: 3,
    user: mockUsers[2],
    channelId: 1,
    createdAt: today(9, 0),
    reactions: [
      { emoji: '☀️', count: 4, userIds: [1, 2, 5, 7] },
      { emoji: '👋', count: 3, userIds: [1, 4, 6] },
    ],
    threadCount: 0,
  },
  {
    id: 7,
    content: 'Morning! Anyone up for coffee at 10?',
    userId: 7,
    user: mockUsers[6],
    channelId: 1,
    createdAt: today(9, 15),
    reactions: [{ emoji: '☕', count: 3, userIds: [2, 3, 5] }],
    threadCount: 4,
    threadLastReplyAt: today(9, 45),
  },
  {
    id: 8,
    content: "Just pushed the new feature to staging. Would love some feedback when you all have a chance! Here's the link: https://staging.example.com/new-feature",
    userId: 9,
    user: mockUsers[8],
    channelId: 1,
    createdAt: today(10, 30),
    reactions: [
      { emoji: '🚀', count: 5, userIds: [1, 2, 3, 4, 5] },
      { emoji: '👏', count: 2, userIds: [1, 7] },
    ],
    threadCount: 8,
    threadLastReplyAt: today(11, 45),
  },
  {
    id: 9,
    content: '@channel Reminder: Sprint planning starts in 30 minutes!',
    userId: 4,
    user: mockUsers[3],
    channelId: 1,
    createdAt: today(13, 30),
    reactions: [{ emoji: '👍', count: 8, userIds: [1, 2, 3, 5, 6, 7, 8, 9] }],
    threadCount: 0,
  },
  {
    id: 10,
    content: "Great sprint planning session everyone! Let's crush it this week.",
    userId: 1,
    user: mockUsers[0],
    channelId: 1,
    createdAt: today(15, 0),
    reactions: [
      { emoji: '💪', count: 6, userIds: [2, 3, 4, 5, 6, 7] },
      { emoji: '🔥', count: 4, userIds: [2, 5, 8, 9] },
    ],
    threadCount: 0,
  },

  // Engineering channel messages
  {
    id: 101,
    content: 'Has anyone worked with the new React 19 features? Thinking about upgrading our project.',
    userId: 9,
    user: mockUsers[8],
    channelId: 3,
    createdAt: daysAgo(1, 10, 0),
    reactions: [{ emoji: '🤔', count: 3, userIds: [3, 5, 8] }],
    threadCount: 12,
    threadLastReplyAt: today(9, 30),
  },
  {
    id: 102,
    content: 'I created a PR for the authentication refactor. Could use some reviews: https://github.com/example/pr/123',
    userId: 3,
    user: mockUsers[2],
    channelId: 3,
    createdAt: today(11, 0),
    reactions: [{ emoji: '👀', count: 2, userIds: [5, 9] }],
    threadCount: 3,
    threadLastReplyAt: today(12, 15),
  },
  {
    id: 103,
    content: 'FYI: CI is currently down. DevOps is working on it.',
    userId: 5,
    user: mockUsers[4],
    channelId: 3,
    createdAt: today(14, 0),
    reactions: [{ emoji: '😬', count: 4, userIds: [3, 8, 9, 10] }],
    threadCount: 5,
    threadLastReplyAt: today(14, 45),
  },

  // Random channel messages
  {
    id: 201,
    content: "Anyone watching the game tonight? Let's set up a watch party!",
    userId: 7,
    user: mockUsers[6],
    channelId: 2,
    createdAt: daysAgo(1, 16, 0),
    reactions: [
      { emoji: '🏈', count: 5, userIds: [2, 3, 5, 8, 10] },
      { emoji: '🍕', count: 3, userIds: [2, 5, 8] },
    ],
    threadCount: 8,
    threadLastReplyAt: daysAgo(1, 18, 30),
  },
  {
    id: 202,
    content: 'Check out this hilarious meme I found 😂',
    userId: 2,
    user: mockUsers[1],
    channelId: 2,
    createdAt: today(12, 30),
    reactions: [
      { emoji: '😂', count: 7, userIds: [1, 3, 4, 5, 6, 7, 9] },
      { emoji: '💀', count: 3, userIds: [1, 3, 7] },
    ],
    threadCount: 2,
    threadLastReplyAt: today(13, 0),
  },
  {
    id: 203,
    content: 'Happy Friday everyone! Any weekend plans?',
    userId: 10,
    user: mockUsers[9],
    channelId: 2,
    createdAt: today(16, 0),
    reactions: [{ emoji: '🎉', count: 5, userIds: [1, 2, 3, 4, 5] }],
    threadCount: 6,
    threadLastReplyAt: today(16, 45),
  },
];

// Helper function to get messages for a specific channel
export const getMessagesByChannel = (channelId: number): Message[] => {
  return mockMessages
    .filter((msg) => msg.channelId === channelId)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
};
