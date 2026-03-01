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
  isMember: boolean;
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

export interface MessageFile {
  id: number;
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  url: string;
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
  files: MessageFile[];
  threadCount: number;
  threadLastReplyAt?: Date;
  isEdited?: boolean;
  isPinned?: boolean;
}
