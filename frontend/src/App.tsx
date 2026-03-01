import { useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/useAuthStore';
import { useChannelStore } from '@/stores/useChannelStore';
import { useMessageStore } from '@/stores/useMessageStore';
import { connectSocket, disconnectSocket, getSocket } from '@/lib/socket';
import { AppLayout } from '@/components/Layout/AppLayout';
import { LoginPage } from '@/components/Auth/LoginPage';
import { RegisterPage } from '@/components/Auth/RegisterPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function AppShell() {
  const fetchChannels = useChannelStore((s) => s.fetchChannels);
  const channels = useChannelStore((s) => s.channels);
  const activeChannelId = useChannelStore((s) => s.activeChannelId);
  const { onMessageNew, onMessageUpdated, onMessageDeleted } = useMessageStore();
  const joinedChannelsRef = useRef<Set<number>>(new Set());

  const fetchDirectMessages = useChannelStore((s) => s.fetchDirectMessages);

  useEffect(() => {
    fetchChannels();
    fetchDirectMessages();
  }, [fetchChannels, fetchDirectMessages]);

  // Connect socket and set up event listeners
  useEffect(() => {
    const socket = connectSocket();

    const handleNewMessage = (msg: import('@/lib/api').ApiMessage) => {
      const { onMessageNew } = useMessageStore.getState();
      const { activeChannelId, incrementUnread } = useChannelStore.getState();
      onMessageNew(msg);
      // If the message is for a channel we're not viewing, increment unread
      if (msg.channelId !== activeChannelId) {
        incrementUnread(msg.channelId);
      }
    };

    const handleUpdatedMessage = (msg: import('@/lib/api').ApiMessage) => {
      useMessageStore.getState().onMessageUpdated(msg);
    };

    const handleDeletedMessage = (data: { messageId: number }) => {
      useMessageStore.getState().onMessageDeleted(data);
    };

    const handleNewDM = (dm: import('@/lib/api').ApiDirectMessage) => {
      const { addOrUpdateDM } = useChannelStore.getState();
      addOrUpdateDM(dm.fromUserId, dm.fromUser.name, dm.fromUser.avatar ?? undefined);
    };

    const handlePresenceUpdate = (data: { userId: number; status: string }) => {
      const { updateDMStatus } = useChannelStore.getState();
      updateDMStatus(data.userId, data.status as import('@/lib/types').DirectMessage['userStatus']);
    };

    socket.on('message:new', handleNewMessage);
    socket.on('message:updated', handleUpdatedMessage);
    socket.on('message:deleted', handleDeletedMessage);
    socket.on('dm:new', handleNewDM);
    socket.on('presence:update', handlePresenceUpdate);

    return () => {
      socket.off('message:new', handleNewMessage);
      socket.off('message:updated', handleUpdatedMessage);
      socket.off('message:deleted', handleDeletedMessage);
      socket.off('dm:new', handleNewDM);
      socket.off('presence:update', handlePresenceUpdate);
      disconnectSocket();
    };
  }, []);

  // Join channel rooms as they become available
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const joinChannels = () => {
      for (const ch of channels) {
        if (ch.isMember && !joinedChannelsRef.current.has(ch.id)) {
          socket.emit('join:channel', ch.id);
          joinedChannelsRef.current.add(ch.id);
        }
      }
    };

    if (socket.connected) {
      joinChannels();
    }
    // Also join when socket reconnects
    socket.on('connect', joinChannels);
    return () => {
      socket.off('connect', joinChannels);
    };
  }, [channels]);

  return <AppLayout />;
}

function App() {
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            <PublicRoute>
              <LoginPage />
            </PublicRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicRoute>
              <RegisterPage />
            </PublicRoute>
          }
        />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
