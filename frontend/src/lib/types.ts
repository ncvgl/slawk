export interface User {
  id: number;
  name: string;
  email: string;
  avatar?: string | null;
  status?: 'online' | 'away' | 'dnd' | 'offline';
  displayName?: string;
}

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
