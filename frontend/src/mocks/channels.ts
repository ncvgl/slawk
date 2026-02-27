export interface Channel {
  id: number;
  name: string;
  description?: string;
  isPrivate: boolean;
  memberCount: number;
  unreadCount: number;
  isMuted?: boolean;
}

export interface DirectMessage {
  id: number;
  userId: number;
  userName: string;
  userAvatar: string;
  userStatus: 'online' | 'away' | 'dnd' | 'offline';
  unreadCount: number;
}

export const mockChannels: Channel[] = [
  {
    id: 1,
    name: 'general',
    description: 'Company-wide announcements and work-based matters',
    isPrivate: false,
    memberCount: 50,
    unreadCount: 0,
  },
  {
    id: 2,
    name: 'random',
    description: 'Non-work banter and water cooler conversation',
    isPrivate: false,
    memberCount: 45,
    unreadCount: 3,
  },
  {
    id: 3,
    name: 'engineering',
    description: 'Engineering team discussions',
    isPrivate: false,
    memberCount: 12,
    unreadCount: 0,
  },
  {
    id: 4,
    name: 'design-team',
    description: 'Design team internal discussions',
    isPrivate: true,
    memberCount: 5,
    unreadCount: 1,
  },
  {
    id: 5,
    name: 'marketing',
    description: 'Marketing campaigns and strategies',
    isPrivate: false,
    memberCount: 8,
    unreadCount: 0,
  },
  {
    id: 6,
    name: 'product',
    description: 'Product roadmap and feature discussions',
    isPrivate: false,
    memberCount: 15,
    unreadCount: 5,
  },
  {
    id: 7,
    name: 'announcements',
    description: 'Important company announcements',
    isPrivate: false,
    memberCount: 100,
    unreadCount: 0,
    isMuted: true,
  },
  {
    id: 8,
    name: 'frontend',
    description: 'Frontend development discussions',
    isPrivate: false,
    memberCount: 8,
    unreadCount: 2,
  },
  {
    id: 9,
    name: 'backend',
    description: 'Backend and API discussions',
    isPrivate: false,
    memberCount: 6,
    unreadCount: 0,
  },
  {
    id: 10,
    name: 'devops',
    description: 'Infrastructure and deployment',
    isPrivate: true,
    memberCount: 4,
    unreadCount: 0,
  },
];

export const mockDirectMessages: DirectMessage[] = [
  {
    id: 1,
    userId: 2,
    userName: 'Bob Smith',
    userAvatar: 'https://i.pravatar.cc/150?img=2',
    userStatus: 'away',
    unreadCount: 2,
  },
  {
    id: 2,
    userId: 3,
    userName: 'Charlie Davis',
    userAvatar: 'https://i.pravatar.cc/150?img=3',
    userStatus: 'online',
    unreadCount: 0,
  },
  {
    id: 3,
    userId: 5,
    userName: 'Edward Brown',
    userAvatar: 'https://i.pravatar.cc/150?img=5',
    userStatus: 'online',
    unreadCount: 0,
  },
  {
    id: 4,
    userId: 7,
    userName: 'George Taylor',
    userAvatar: 'https://i.pravatar.cc/150?img=7',
    userStatus: 'online',
    unreadCount: 1,
  },
];
