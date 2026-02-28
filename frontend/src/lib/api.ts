class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('token');

  const res = await fetch(endpoint, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new ApiError(body.error || 'Request failed', res.status);
  }

  return res.json();
}

// ---- Auth ----

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  avatar?: string | null;
  createdAt: string;
}

export interface AuthResponse {
  user: AuthUser;
  token: string;
}

export function login(email: string, password: string) {
  return request<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function register(name: string, email: string, password: string) {
  return request<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, name }),
  });
}

// ---- Channels ----

export interface ApiChannel {
  id: number;
  name: string;
  isPrivate: boolean;
  createdAt: string;
  unreadCount: number;
  isMember: boolean;
  _count: { members: number; messages: number };
}

export function getChannels() {
  return request<ApiChannel[]>('/channels');
}

export function getChannel(id: number) {
  return request<ApiChannel>(`/channels/${id}`);
}

export function createChannel(name: string, isPrivate = false) {
  return request<ApiChannel>('/channels', {
    method: 'POST',
    body: JSON.stringify({ name, isPrivate }),
  });
}

export function joinChannel(id: number) {
  return request<{ message: string }>(`/channels/${id}/join`, { method: 'POST' });
}

export function leaveChannel(id: number) {
  return request<{ message: string }>(`/channels/${id}/leave`, { method: 'POST' });
}

export function markChannelRead(channelId: number, messageId: number) {
  return request<{ success: boolean }>(`/channels/${channelId}/read`, {
    method: 'POST',
    body: JSON.stringify({ messageId }),
  });
}

// ---- Messages ----

export interface ApiReaction {
  id: number;
  emoji: string;
  userId: number;
  messageId: number;
  createdAt: string;
  user: { id: number; name: string };
}

export interface ApiMessage {
  id: number;
  content: string;
  userId: number;
  channelId: number;
  threadId: number | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  user: { id: number; name: string; email: string; avatar?: string | null };
  reactions: ApiReaction[];
  files: { id: number; filename: string; mimetype: string; size: number; url: string }[];
  _count: { replies: number };
}

export interface MessagesResponse {
  messages: ApiMessage[];
  nextCursor?: number;
  hasMore: boolean;
}

export function getMessages(channelId: number, cursor?: number, limit = 50) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', String(cursor));
  return request<MessagesResponse>(`/channels/${channelId}/messages?${params}`);
}

export function sendMessage(channelId: number, content: string) {
  return request<ApiMessage>(`/channels/${channelId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}

// ---- Reactions ----

export function addReaction(messageId: number, emoji: string) {
  return request<ApiReaction>(`/messages/${messageId}/reactions`, {
    method: 'POST',
    body: JSON.stringify({ emoji }),
  });
}

export function removeReaction(messageId: number, emoji: string) {
  return request<{ message: string }>(
    `/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
    { method: 'DELETE' },
  );
}

// ---- Threads ----

export function getThread(messageId: number) {
  return request<{ parent: ApiMessage; replies: ApiMessage[] }>(
    `/messages/${messageId}/thread`,
  );
}

export function replyToMessage(messageId: number, content: string) {
  return request<ApiMessage>(`/messages/${messageId}/reply`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}

// ---- Messages (edit/delete) ----

export function editMessage(messageId: number, content: string) {
  return request<ApiMessage>(`/messages/${messageId}`, {
    method: 'PATCH',
    body: JSON.stringify({ content }),
  });
}

export function deleteMessage(messageId: number) {
  return request<{ message: string }>(`/messages/${messageId}`, {
    method: 'DELETE',
  });
}

// ---- Search ----

export interface SearchResult {
  id: number;
  type: 'message' | 'dm';
  content: string;
  createdAt: string;
  user: { id: number; name: string; email: string; avatar?: string | null };
  channel?: { id: number; name: string };
  participant?: { id: number; name: string; email: string };
}

export interface SearchResponse {
  results: SearchResult[];
  query: string;
  counts: { messages: number; dms: number; total: number };
}

export function searchMessages(query: string, channelId?: number) {
  const params = new URLSearchParams({ q: query });
  if (channelId) params.set('channelId', String(channelId));
  return request<SearchResponse>(`/search?${params}`);
}

// ---- Users ----

export function getUsers() {
  return request<AuthUser[]>('/users');
}
