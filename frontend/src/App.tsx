import { useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useNavigate, useParams, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/useAuthStore';
import { useChannelStore } from '@/stores/useChannelStore';
import { useMessageStore } from '@/stores/useMessageStore';
import { useDMStore } from '@/stores/useDMStore';
import { useBookmarkStore } from '@/stores/useBookmarkStore';
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

/**
 * Syncs URL params to the channel store.
 * - /channels/:channelId  → sets activeChannelId
 * - /dm/:userId           → sets activeDMId
 */
function RouteSync() {
  const { channelId, userId } = useParams<{ channelId?: string; userId?: string }>();
  const location = useLocation();
  const setActiveChannel = useChannelStore((s) => s.setActiveChannel);
  const setActiveDM = useChannelStore((s) => s.setActiveDM);

  useEffect(() => {
    if (channelId) {
      const id = parseInt(channelId, 10);
      if (!isNaN(id)) {
        const scrollToMessageId = (location.state as any)?.scrollToMessageId;
        setActiveChannel(id, scrollToMessageId);
      }
    } else if (userId) {
      const id = parseInt(userId, 10);
      if (!isNaN(id)) {
        setActiveDM(id);
      }
    }
  }, [channelId, userId, setActiveChannel, setActiveDM, location.state]);

  return null;
}

/**
 * Clears active channel/DM when navigating to /files so MessageArea
 * knows to render the full-page files view.
 */
function FileRouteSync() {
  useEffect(() => {
    useChannelStore.setState({ activeChannelId: null, activeDMId: null });
  }, []);
  return null;
}

function LaterRouteSync() {
  useEffect(() => {
    useChannelStore.setState({ activeChannelId: null, activeDMId: null });
  }, []);
  return null;
}

/**
 * Redirects / to /channels/:id for the first available member channel.
 */
function DefaultRedirect() {
  const channels = useChannelStore((s) => s.channels);
  const isLoading = useChannelStore((s) => s.isLoading);
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) return;
    const firstChannel = channels.find((ch) => ch.isMember);
    if (firstChannel) {
      navigate(`/c/${firstChannel.id}`, { replace: true });
    }
  }, [channels, isLoading, navigate]);

  return null;
}

function AppShell() {
  const fetchChannels = useChannelStore((s) => s.fetchChannels);
  const channels = useChannelStore((s) => s.channels);
  const joinedChannelsRef = useRef<Set<number>>(new Set());

  const fetchDirectMessages = useChannelStore((s) => s.fetchDirectMessages);
  const loadBookmarks = useBookmarkStore((s) => s.load);

  useEffect(() => {
    fetchChannels();
    fetchDirectMessages();
    loadBookmarks();
  }, [fetchChannels, fetchDirectMessages, loadBookmarks]);

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
      const { addOrUpdateDM, activeDMId, incrementDMUnread } = useChannelStore.getState();
      const currentUser = useAuthStore.getState().user;
      const isSelfDM = currentUser && dm.fromUserId === currentUser.id && dm.toUserId === currentUser.id;
      addOrUpdateDM(dm.fromUserId, dm.fromUser.name, dm.fromUser.avatar ?? undefined);
      if (activeDMId !== dm.fromUserId && !isSelfDM) {
        incrementDMUnread(dm.fromUserId);
      }
      // Add message to DM store if conversation is loaded
      if (currentUser) {
        useDMStore.getState().addIncomingMessage(dm, currentUser.id);
      }
    };

    const handlePresenceUpdate = (data: { userId: number; status: string }) => {
      const { updateDMStatus } = useChannelStore.getState();
      updateDMStatus(data.userId, data.status as import('@/lib/types').DirectMessage['userStatus']);
    };

    const handleMemberAdded = (data: { channelId: number; memberCount: number }) => {
      useChannelStore.getState().updateMemberCount(data.channelId, data.memberCount);
    };

    const handleMemberLeft = (data: { channelId: number; memberCount: number }) => {
      useChannelStore.getState().updateMemberCount(data.channelId, data.memberCount);
    };

    const handleChannelJoined = () => {
      // Re-fetch channels so the new channel appears in the sidebar
      useChannelStore.getState().fetchChannels();
    };

    socket.on('message:new', handleNewMessage);
    socket.on('message:updated', handleUpdatedMessage);
    socket.on('message:deleted', handleDeletedMessage);
    socket.on('dm:new', handleNewDM);
    socket.on('presence:update', handlePresenceUpdate);
    socket.on('channel:member-added', handleMemberAdded);
    socket.on('channel:member-left', handleMemberLeft);
    socket.on('channel:joined', handleChannelJoined);

    return () => {
      socket.off('message:new', handleNewMessage);
      socket.off('message:updated', handleUpdatedMessage);
      socket.off('message:deleted', handleDeletedMessage);
      socket.off('dm:new', handleNewDM);
      socket.off('presence:update', handlePresenceUpdate);
      socket.off('channel:member-added', handleMemberAdded);
      socket.off('channel:member-left', handleMemberLeft);
      socket.off('channel:joined', handleChannelJoined);
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

  return (
    <>
      <Outlet />
      <AppLayout />
    </>
  );
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
          path="/"
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<DefaultRedirect />} />
          <Route path="c/:channelId" element={<RouteSync />} />
          <Route path="d/:userId" element={<RouteSync />} />
          <Route path="files" element={<FileRouteSync />} />
          <Route path="later" element={<LaterRouteSync />} />
          <Route path="*" element={<DefaultRedirect />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
