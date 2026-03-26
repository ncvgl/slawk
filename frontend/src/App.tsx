import { useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useNavigate, useParams, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/useAuthStore';
import { useChannelStore } from '@/stores/useChannelStore';
import { useMessageStore } from '@/stores/useMessageStore';
import { useDMStore } from '@/stores/useDMStore';
import { useBookmarkStore } from '@/stores/useBookmarkStore';
import { connectSocket, disconnectSocket, getSocket } from '@/lib/socket';
import { useNotificationStore } from '@/stores/useNotificationStore';
import { useHuddleStore, setHuddleUserId } from '@/stores/useHuddleStore';
import { useConnectionStore } from '@/stores/useConnectionStore';
import { HuddleBar } from '@/components/Huddle/HuddleBar';
import { HuddleIncomingCall } from '@/components/Huddle/HuddleIncomingCall';
import { AppLayout } from '@/components/Layout/AppLayout';
import { LoginPage } from '@/components/Auth/LoginPage';
import { RegisterPage } from '@/components/Auth/RegisterPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isHydrating } = useAuthStore();

  if (isHydrating) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    );
  }

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
  const navigate = useNavigate();
  const setActiveChannel = useChannelStore((s) => s.setActiveChannel);
  const setActiveDM = useChannelStore((s) => s.setActiveDM);
  const channels = useChannelStore((s) => s.channels);

  // Re-run when channels finish loading so we can validate the channel exists
  const channelsLoaded = channels.length > 0;

  useEffect(() => {
    if (channelId) {
      const id = parseInt(channelId, 10);
      if (isNaN(id) || id <= 0) return;
      // Verify channel exists (non-member public channels are allowed in read-only mode)
      const allChannels = useChannelStore.getState().channels;
      if (allChannels.length > 0 && !allChannels.find((ch) => ch.id === id)) {
        navigate('/', { replace: true });
        return;
      }
      const scrollRaw = (location.state as any)?.scrollToMessageId;
      const scrollToMessageId = typeof scrollRaw === 'number' && scrollRaw > 0 ? scrollRaw : undefined;
      setActiveChannel(id, scrollToMessageId);
    } else if (userId) {
      const id = parseInt(userId, 10);
      if (!isNaN(id) && id > 0) {
        const dmScrollRaw = (location.state as any)?.scrollToMessageId;
        const dmScrollToMessageId = typeof dmScrollRaw === 'number' && dmScrollRaw > 0 ? dmScrollRaw : undefined;
        setActiveDM(id, dmScrollToMessageId);
      }
    }
  }, [channelId, userId, setActiveChannel, setActiveDM, location.state, channelsLoaded, navigate]);

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

function AdminRouteSync() {
  useEffect(() => {
    useChannelStore.setState({ activeChannelId: null, activeDMId: null });
  }, []);
  return null;
}

function AdminGuard({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const isHydrating = useAuthStore((s) => s.isHydrating);
  const navigate = useNavigate();

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'OWNER';

  useEffect(() => {
    if (!isHydrating && user && !isAdmin) {
      navigate('/', { replace: true });
    }
  }, [user, isHydrating, isAdmin, navigate]);

  if (isHydrating || !user || !isAdmin) return null;
  return <>{children}</>;
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

function useFocusTracking() {
  const activeChannelId = useChannelStore((s) => s.activeChannelId);
  const activeDMId = useChannelStore((s) => s.activeDMId);
  const prevViewRef = useRef<{ type: string; id: number | null }>({ type: '', id: null });

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const viewType = activeChannelId ? 'channel' : activeDMId ? 'dm' : 'none';
    const viewId = activeChannelId || activeDMId || null;

    // Only emit if view actually changed
    if (prevViewRef.current.type === viewType && prevViewRef.current.id === viewId) return;
    prevViewRef.current = { type: viewType, id: viewId };

    if (activeChannelId) {
      socket.emit('focus:channel', activeChannelId);
    } else if (activeDMId) {
      socket.emit('focus:dm', activeDMId);
    } else {
      socket.emit('focus:none');
    }
  }, [activeChannelId, activeDMId]);

  // Track tab visibility — emit focus:none when hidden, restore when visible
  useEffect(() => {
    const handleVisibility = () => {
      const socket = getSocket();
      if (!socket) return;

      if (document.hidden) {
        socket.emit('focus:none');
      } else {
        const { activeChannelId, activeDMId } = useChannelStore.getState();
        if (activeChannelId) {
          socket.emit('focus:channel', activeChannelId);
        } else if (activeDMId) {
          socket.emit('focus:dm', activeDMId);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);
}

function AppShell() {
  const fetchChannels = useChannelStore((s) => s.fetchChannels);
  const channels = useChannelStore((s) => s.channels);
  const joinedChannelsRef = useRef<Set<number>>(new Set());

  const fetchDirectMessages = useChannelStore((s) => s.fetchDirectMessages);
  const loadBookmarks = useBookmarkStore((s) => s.load);

  // Track which channel/DM the user is viewing for smart push notifications
  useFocusTracking();

  useEffect(() => {
    fetchChannels();
    fetchDirectMessages();
    loadBookmarks();

    // Auto-request push notification permission on first load
    const { permission, isSubscribed, subscribe } = useNotificationStore.getState();
    if (permission !== 'unsupported' && permission !== 'denied' && !isSubscribed) {
      subscribe();
    }
  }, [fetchChannels, fetchDirectMessages, loadBookmarks]);

  // Connect socket and set up event listeners
  useEffect(() => {
    const socket = connectSocket();
    if (!socket) {
      console.warn('[AppShell] No socket connection — token may be missing');
      return;
    }

    // Set user ID for huddle store
    const currentUserId = useAuthStore.getState().user?.id;
    if (currentUserId) setHuddleUserId(currentUserId);

    // Mark self as online as soon as socket connects (fixes race with hydrate/getMyProfile)
    const handleConnect = () => {
      useAuthStore.getState().updateUser({ status: 'online' });
      useConnectionStore.getState().setConnected(true);
    };
    // If already connected (reconnect scenario), update immediately
    if (socket.connected) handleConnect();

    const handleNewMessage = (msg: import('@/lib/api').ApiMessage) => {
      const { onMessageNew } = useMessageStore.getState();
      const { activeChannelId, incrementUnread } = useChannelStore.getState();
      onMessageNew(msg);
      // If the message is for a channel we're not viewing, increment unread
      if (msg.channelId !== activeChannelId) {
        incrementUnread(msg.channelId);
        // Show desktop notification when tab is hidden (visible tab uses in-app unread indicators)
        if (document.hidden && msg.user?.id !== currentUserId && Notification.permission === 'granted' && navigator.serviceWorker?.controller) {
          const channelName = useChannelStore.getState().channels.find(c => c.id === msg.channelId)?.name;
          if (channelName) {
            navigator.serviceWorker.ready.then((reg) => {
              reg.showNotification(`#${channelName}`, {
                body: `${msg.user?.name || 'Someone'}: ${(msg.content || '').slice(0, 100)}`,
                icon: '/favicon-192.png',
                badge: '/favicon-192.png',
                data: { url: `/c/${msg.channelId}` },
              });
            }).catch(() => {});
          }
        }
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
      if (!currentUser) return;
      // Validate DM involves the current user
      if (dm.fromUserId !== currentUser.id && dm.toUserId !== currentUser.id) return;
      // Validate required fields
      if (typeof dm.fromUser?.id !== 'number' || typeof dm.toUser?.id !== 'number') return;
      if (typeof dm.fromUser?.name !== 'string' || typeof dm.toUser?.name !== 'string') return;
      const isSelfDM = dm.fromUserId === currentUser.id && dm.toUserId === currentUser.id;
      const isFromMe = dm.fromUserId === currentUser.id;
      const otherUser = isFromMe ? dm.toUser : dm.fromUser;
      const otherUserId = otherUser.id;
      if (!isSelfDM) {
        addOrUpdateDM(otherUserId, otherUser.name, otherUser.avatar ?? undefined);
      }
      if (activeDMId !== otherUserId && !isSelfDM) {
        incrementDMUnread(otherUserId);
        // Show desktop notification when tab is hidden (visible tab uses in-app unread indicators)
        if (document.hidden && !isFromMe && Notification.permission === 'granted' && navigator.serviceWorker?.controller) {
          navigator.serviceWorker.ready.then((reg) => {
            reg.showNotification(otherUser.name, {
              body: (dm.content || '').slice(0, 100) || 'Sent an attachment',
              icon: '/favicon-192.png',
              badge: '/favicon-192.png',
              data: { url: `/d/${otherUserId}` },
            });
          }).catch(() => {});
        }
      }
      // Add message to DM store if conversation is loaded
      useDMStore.getState().addIncomingMessage(dm, currentUser.id);
    };

    const handleDMUpdated = (dm: import('@/lib/api').ApiDirectMessage) => {
      const currentUser = useAuthStore.getState().user;
      if (!currentUser) return;
      useDMStore.getState().onDMUpdated(dm, currentUser.id);
    };

    const handleDMDeleted = (data: { dmId: number; fromUserId: number; toUserId: number }) => {
      const currentUser = useAuthStore.getState().user;
      if (!currentUser) return;
      useDMStore.getState().onDMDeleted(data, currentUser.id);
    };

    const handleDMReply = (reply: import('@/lib/api').ApiDirectMessage & { threadId: number }) => {
      const currentUser = useAuthStore.getState().user;
      if (!currentUser || !reply.threadId) return;
      // Skip for sender — their reply count is already updated via the REST response path
      if (reply.fromUserId === currentUser.id) return;
      const otherUserId = reply.fromUserId;
      const participant = { id: reply.fromUser.id, name: reply.fromUser.name, avatar: reply.fromUser.avatar ?? null };
      useDMStore.getState().incrementReplyCount(reply.threadId, otherUserId, participant);
      // Show desktop notification for DM thread replies when tab is hidden
      const { activeDMId } = useChannelStore.getState();
      if (document.hidden && activeDMId !== otherUserId && Notification.permission === 'granted' && navigator.serviceWorker?.controller) {
        navigator.serviceWorker.ready.then((reg) => {
          reg.showNotification(`${reply.fromUser.name} (thread)`, {
            body: (reply.content || '').slice(0, 100) || 'Sent an attachment',
            icon: '/favicon-192.png',
            badge: '/favicon-192.png',
            data: { url: `/d/${otherUserId}` },
          });
        }).catch(() => {});
      }
    };

    const handleDMReactionAdded = (data: { dmId: number; reaction: { emoji: string; userId: number; user: { name: string } } }) => {
      useDMStore.getState().onReactionAdded(data);
    };

    const handleDMReactionRemoved = (data: { dmId: number; emoji: string; userId: number }) => {
      useDMStore.getState().onReactionRemoved(data);
    };

    const handlePresenceUpdate = (data: { userId: number; status: string }) => {
      const { updateDMStatus } = useChannelStore.getState();
      updateDMStatus(data.userId, data.status as import('@/lib/types').DirectMessage['userStatus']);
      // Also update own status in auth store when server confirms our presence
      const currentUser = useAuthStore.getState().user;
      if (currentUser && data.userId === currentUser.id) {
        useAuthStore.getState().updateUser({ status: data.status as any });
      }
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

    const handleChannelDeleted = (data: { channelId: number }) => {
      // Re-fetch channels to remove the deleted channel from sidebar
      useChannelStore.getState().fetchChannels();
      // Clear cached messages for the deleted channel so stale data doesn't re-appear
      const msgStore = useMessageStore.getState();
      if (msgStore.loadedChannelId === data.channelId) {
        useMessageStore.setState({ messages: [], loadedChannelId: null });
      }
      const { activeChannelId } = useChannelStore.getState();
      if (activeChannelId === data.channelId) {
        useChannelStore.setState({ activeChannelId: null });
      }
    };

    const handleChannelArchived = (data: { channelId: number }) => {
      useChannelStore.getState().fetchChannels();
      const { activeChannelId } = useChannelStore.getState();
      if (activeChannelId === data.channelId) {
        useChannelStore.setState({ activeChannelId: null });
      }
    };

    const handleChannelUnarchived = () => {
      useChannelStore.getState().fetchChannels();
    };

    const handleReactionAdded = (data: { messageId: number; reaction: { emoji: string; userId: number; user: { name: string } } }) => {
      useMessageStore.getState().onReactionAdded(data);
    };

    const handleReactionRemoved = (data: { messageId: number; emoji: string; userId: number }) => {
      useMessageStore.getState().onReactionRemoved(data);
    };

    socket.on('connect', handleConnect);
    socket.on('message:new', handleNewMessage);
    socket.on('message:updated', handleUpdatedMessage);
    socket.on('message:deleted', handleDeletedMessage);
    socket.on('dm:new', handleNewDM);
    socket.on('dm:updated', handleDMUpdated);
    socket.on('dm:deleted', handleDMDeleted);
    socket.on('dm:reply', handleDMReply);
    socket.on('dm:reaction:added', handleDMReactionAdded);
    socket.on('dm:reaction:removed', handleDMReactionRemoved);
    socket.on('presence:update', handlePresenceUpdate);
    socket.on('channel:member-added', handleMemberAdded);
    socket.on('channel:member-left', handleMemberLeft);
    socket.on('channel:joined', handleChannelJoined);
    socket.on('channel:deleted', handleChannelDeleted);
    socket.on('channel:archived', handleChannelArchived);
    socket.on('channel:unarchived', handleChannelUnarchived);
    socket.on('reaction:added', handleReactionAdded);
    socket.on('reaction:removed', handleReactionRemoved);

    // Huddle events
    const handleInviteSent = (data: { inviteId: string; toUserId: number }) =>
      useHuddleStore.getState().onInviteSent(data);
    const handleInviteReceived = (data: import('@/stores/useHuddleStore').IncomingInvite) =>
      useHuddleStore.getState().onInviteReceived(data);
    const handleInviteCancelled = (data: { inviteId: string; reason: string }) =>
      useHuddleStore.getState().onInviteCancelled(data);
    const handleHuddleConnected = (data: { huddleId: string; isInitiator: boolean; peer: { userId: number; name: string; avatar: string | null; isMuted: boolean } }) =>
      useHuddleStore.getState().onHuddleConnected(data);
    const handleHuddleSignal = (data: { huddleId: string; fromUserId: number; signal: { type: string; sdp?: string; candidate?: unknown } }) =>
      useHuddleStore.getState().onSignal(data);
    const handleHuddleMuteChanged = (data: { huddleId: string; userId: number; isMuted: boolean }) =>
      useHuddleStore.getState().onMuteChanged(data);
    const handleHuddleEnded = (data: { huddleId: string }) =>
      useHuddleStore.getState().onHuddleEnded(data);

    const handleHuddleError = (data: { message: string }) =>
      useHuddleStore.setState({ error: data.message });

    socket.on('huddle:invite:sent', handleInviteSent);
    socket.on('huddle:invite:received', handleInviteReceived);
    socket.on('huddle:invite:cancelled', handleInviteCancelled);
    socket.on('huddle:connected', handleHuddleConnected);
    socket.on('huddle:signal', handleHuddleSignal);
    socket.on('huddle:mute-changed', handleHuddleMuteChanged);
    socket.on('huddle:ended', handleHuddleEnded);
    socket.on('huddle:error', handleHuddleError);

    const handleDisconnect = () => {
      joinedChannelsRef.current.clear();
      useHuddleStore.getState().cleanup();
      useConnectionStore.getState().setConnected(false);
    };
    socket.on('disconnect', handleDisconnect);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('message:new', handleNewMessage);
      socket.off('message:updated', handleUpdatedMessage);
      socket.off('message:deleted', handleDeletedMessage);
      socket.off('dm:new', handleNewDM);
      socket.off('dm:updated', handleDMUpdated);
      socket.off('dm:deleted', handleDMDeleted);
      socket.off('dm:reply', handleDMReply);
      socket.off('dm:reaction:added', handleDMReactionAdded);
      socket.off('dm:reaction:removed', handleDMReactionRemoved);
      socket.off('presence:update', handlePresenceUpdate);
      socket.off('channel:member-added', handleMemberAdded);
      socket.off('channel:member-left', handleMemberLeft);
      socket.off('channel:joined', handleChannelJoined);
      socket.off('channel:deleted', handleChannelDeleted);
      socket.off('channel:archived', handleChannelArchived);
      socket.off('channel:unarchived', handleChannelUnarchived);
      socket.off('reaction:added', handleReactionAdded);
      socket.off('reaction:removed', handleReactionRemoved);
      socket.off('huddle:invite:sent', handleInviteSent);
      socket.off('huddle:invite:received', handleInviteReceived);
      socket.off('huddle:invite:cancelled', handleInviteCancelled);
      socket.off('huddle:connected', handleHuddleConnected);
      socket.off('huddle:signal', handleHuddleSignal);
      socket.off('huddle:mute-changed', handleHuddleMuteChanged);
      socket.off('huddle:ended', handleHuddleEnded);
      socket.off('huddle:error', handleHuddleError);
      socket.off('disconnect', handleDisconnect);
      useHuddleStore.getState().cleanup();
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
      <HuddleBar />
      <HuddleIncomingCall />
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
          <Route path="admin" element={<AdminGuard><AdminRouteSync /></AdminGuard>} />
          <Route path="*" element={<DefaultRedirect />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
