import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  FileText,
  Bookmark,
  ChevronDown,
  ChevronRight,
  Plus,
  SquarePen,
  LogOut,
  Star,
  User,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useChannelStore } from '@/stores/useChannelStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useProfileStore } from '@/stores/useProfileStore';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ChannelItem } from './ChannelItem';
import { DirectMessageItem } from './DirectMessageItem';
import { AddChannelDialog } from './AddChannelDialog';
import { AddTeammatesDialog } from './AddTeammatesDialog';
import type { Channel } from '@/lib/types';
import { getChannels } from '@/lib/api';
import type { AuthUser } from '@/lib/api';
import { useMobileStore } from '@/stores/useMobileStore';
// HuddleBar moved to global render in App.tsx

const navItems = [
  { icon: Bookmark, label: 'Later', id: 'later' },
  { icon: FileText, label: 'Files', id: 'files' },
];

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { channels, directMessages, activeChannelId, activeDMId, startDM, createChannel, joinChannel, fetchChannels } =
    useChannelStore();
  const { user, logout } = useAuthStore();
  const { openProfile } = useProfileStore();
  const closeSidebar = useMobileStore((s) => s.closeSidebar);
  const [channelsExpanded, setChannelsExpanded] = useState(true);
  const [dmsExpanded, setDmsExpanded] = useState(true);
  const activeNav = location.pathname === '/files' ? 'files' : location.pathname === '/later' ? 'later' : location.pathname === '/admin' ? 'admin' : 'dms';
  const [showAvatarMenu, setShowAvatarMenu] = useState(false);
  const [showAddChannelDialog, setShowAddChannelDialog] = useState(false);
  const [browseChannels, setBrowseChannels] = useState<Channel[]>([]);
  const [showAddTeammates, setShowAddTeammates] = useState(false);
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);
  const avatarMenuRef = useRef<HTMLDivElement>(null);
  const workspaceMenuRef = useRef<HTMLDivElement>(null);

  // Close avatar menu when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (avatarMenuRef.current && !avatarMenuRef.current.contains(e.target as Node)) {
        setShowAvatarMenu(false);
      }
    }
    if (showAvatarMenu) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [showAvatarMenu]);

  // Close workspace menu when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (workspaceMenuRef.current && !workspaceMenuRef.current.contains(e.target as Node)) {
        setShowWorkspaceMenu(false);
      }
    }
    if (showWorkspaceMenu) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [showWorkspaceMenu]);

  const handleOpenAddChannel = () => {
    setShowAddChannelDialog(true);
  };

  const handleBrowseChannels = async () => {
    try {
      const apiChannels = await getChannels();
      const allPublic: Channel[] = apiChannels
        .filter((ch) => !ch.isPrivate)
        .map((ch) => ({
          id: ch.id,
          name: ch.name,
          isPrivate: ch.isPrivate,
          memberCount: ch._count.members,
          unreadCount: ch.unreadCount,
          isMember: ch.isMember,
        }));
      setBrowseChannels(allPublic);
    } catch {
      setBrowseChannels([]);
    }
  };

  const handleCreateChannel = async (name: string, isPrivate?: boolean) => {
    const channelId = await createChannel(name, isPrivate);
    setShowAddChannelDialog(false);
    navTo(`/c/${channelId}`);
  };

  const handleJoinChannel = async (channelId: number) => {
    try {
      await joinChannel(channelId);
      setShowAddChannelDialog(false);
      navTo(`/c/${channelId}`);
    } catch {
      // error already logged in store
    }
  };

  const handleOpenAddTeammates = () => {
    setShowAddTeammates(true);
  };

  const handleSelectUser = (u: AuthUser) => {
    startDM(u.id, u.name, u.avatar ?? undefined);
    setShowAddTeammates(false);
    navTo(`/d/${u.id}`);
  };

  // Navigate and close sidebar on mobile
  const navTo = (path: string) => {
    navigate(path);
    closeSidebar();
  };

  const sortByName = (a: Channel, b: Channel) => a.name.localeCompare(b.name);
  const starredChannels = channels.filter((ch) => ch.isStarred && ch.isMember).sort(sortByName);
  const publicChannels = channels.filter((ch) => !ch.isPrivate && ch.isMember).sort(sortByName);
  const privateChannels = channels.filter((ch) => ch.isPrivate && ch.isMember).sort(sortByName);

  return (
    <div className="flex h-full">
      {/* Nav Rail - 70px wide, darker purple */}
      <div className="flex w-[70px] flex-col items-center bg-slack-sidebar-dark pt-[max(0.5rem,env(safe-area-inset-top))] gap-0">
        {/* Workspace Icon - 36x36px */}
        <button className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg overflow-hidden hover:rounded-xl transition-all">
          <img src="/favicon-192.png" alt="Slawk" className="h-full w-full object-cover" />
        </button>

        {/* Nav Items - 52x68px each with icon + label */}
        {navItems.map((item) => (
          <button
            key={item.id}
            data-testid={`nav-item-${item.id}`}
            onClick={() => {
              if (item.id === 'files') {
                if (activeNav === 'files') {
                  const firstChannel = channels.find((ch) => ch.isMember);
                  if (firstChannel) navTo(`/c/${firstChannel.id}`);
                } else {
                  navTo('/files');
                }
              } else if (item.id === 'later') {
                if (activeNav === 'later') {
                  const firstChannel = channels.find((ch) => ch.isMember);
                  if (firstChannel) navTo(`/c/${firstChannel.id}`);
                } else {
                  navTo('/later');
                }
              } else if (item.id === 'dms') {
                handleOpenAddTeammates();
              }
            }}
            className={cn(
              'relative flex flex-col h-[68px] w-[52px] items-center justify-center gap-1 rounded-lg transition-colors',
              activeNav === item.id
                ? 'bg-slack-sidebar-hover/50 text-white'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            )}
          >
            <item.icon className="h-5 w-5" />
            <span className="text-[11px] font-medium">{item.label}</span>
            {item.badge && (
              <span className="absolute top-2 right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] text-white">
                {item.badge}
              </span>
            )}
          </button>
        ))}

        {/* Admin Nav Item - only visible to admins and owner */}
        {(user?.role === 'ADMIN' || user?.role === 'OWNER') && (
          <button
            data-testid="nav-item-admin"
            onClick={() => {
              if (activeNav === 'admin') {
                const firstChannel = channels.find((ch) => ch.isMember);
                if (firstChannel) navTo(`/c/${firstChannel.id}`);
              } else {
                navTo('/admin');
              }
            }}
            className={cn(
              'relative flex flex-col h-[68px] w-[52px] items-center justify-center gap-1 rounded-lg transition-colors',
              activeNav === 'admin'
                ? 'bg-slack-sidebar-hover/50 text-white'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            )}
          >
            <Shield className="h-5 w-5" />
            <span className="text-[11px] font-medium">Admin</span>
          </button>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* User Avatar */}
        {user && (
          <div className="relative mb-3" ref={avatarMenuRef}>
            <button
              data-testid="user-menu-button"
              onClick={() => setShowAvatarMenu(!showAvatarMenu)}
            >
              <Avatar
                src={user.avatar}
                alt={user.name}
                fallback={user.name}
                size="md"
                status={user.status}
                className="cursor-pointer"
              />
            </button>
            {showAvatarMenu && (
              <div className="absolute bottom-10 left-0 z-50 w-48 rounded-lg border border-slack-border bg-white py-1 shadow-lg">
                <div className="px-4 py-2 border-b border-slack-border-light">
                  <p className="text-sm font-medium text-slack-primary">{user.name}</p>
                  <p className="text-xs text-slack-hint">{user.email}</p>
                </div>
                <Button variant="menu-item" onClick={() => { setShowAvatarMenu(false); openProfile(); }}>
                  <User className="h-4 w-4" />
                  Profile
                </Button>
                <Button variant="menu-item" onClick={() => { setShowAvatarMenu(false); logout(); }}>
                  <LogOut className="h-4 w-4" />
                  Sign out
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Channel Sidebar - lighter/warmer purple with overlay effect */}
      <div data-testid="sidebar" className="flex w-[260px] flex-col bg-slack-sidebar text-white/70">
        {/* Workspace Header - 44px height, 6px 16px padding */}
        <div className="flex h-[44px] items-center justify-between border-b border-white/10 px-4 py-[6px] mt-[env(safe-area-inset-top)]">
          <span className="text-[18px] font-bold text-white">Slawk</span>
          <button onClick={handleOpenAddTeammates} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
            <SquarePen className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Content - 0 0 16px 0 padding */}
        <div className="flex-1 overflow-y-auto pb-4">
          {/* Starred Section */}
          {starredChannels.length > 0 && (
            <div data-testid="starred-section" className="mb-3 mt-3">
              <div className="flex w-full items-center gap-1.5 pl-4 pr-2 py-[6px] text-[15px] text-white/70">
                <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                <span>Starred</span>
              </div>
              <div>
                {starredChannels.map((channel) => (
                  <ChannelItem
                    key={channel.id}
                    channel={channel}
                    isActive={activeChannelId === channel.id}
                    onClick={() => navTo(`/c/${channel.id}`)}
                    isPrivate={channel.isPrivate}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Channels Section */}
          <div className="mb-3 mt-3">
            <button
              onClick={() => setChannelsExpanded(!channelsExpanded)}
              className="flex w-full items-center gap-1.5 pl-4 pr-2 py-[6px] text-[15px] hover:bg-slack-sidebar-hover/70"
            >
              {channelsExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              <span>Channels</span>
            </button>

            {channelsExpanded && (
              <div>
                {publicChannels.map((channel) => (
                  <ChannelItem
                    key={channel.id}
                    channel={channel}
                    isActive={activeChannelId === channel.id}
                    onClick={() => navTo(`/c/${channel.id}`)}
                  />
                ))}
                {privateChannels.map((channel) => (
                  <ChannelItem
                    key={channel.id}
                    channel={channel}
                    isActive={activeChannelId === channel.id}
                    onClick={() => navTo(`/c/${channel.id}`)}
                    isPrivate
                  />
                ))}
                {user?.role !== 'GUEST' && (
                  <button
                    onClick={handleOpenAddChannel}
                    className="flex items-center gap-2 mx-2 w-[calc(100%-16px)] px-4 h-[28px] text-[15px] rounded-[6px] text-left text-white/70 hover:bg-slack-sidebar-hover hover:text-white"
                  >
                    <Plus className="w-4 h-4 flex-shrink-0" />
                    <span>Add channels</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Direct Messages Section */}
          <div>
            <button
              onClick={() => setDmsExpanded(!dmsExpanded)}
              className="flex w-full items-center gap-1.5 pl-4 pr-2 py-[6px] text-[15px] hover:bg-slack-sidebar-hover/70"
            >
              {dmsExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              <span>Direct messages</span>
            </button>

            {dmsExpanded && (
              <div>
                {directMessages.map((dm) => (
                  <DirectMessageItem
                    key={dm.id}
                    dm={dm}
                    isActive={activeDMId === dm.id}
                    onClick={() => navTo(`/d/${dm.userId}`)}
                  />
                ))}
                <button
                  onClick={handleOpenAddTeammates}
                  className="flex items-center gap-2 mx-2 w-[calc(100%-16px)] px-4 h-[28px] text-[15px] rounded-[6px] text-left text-white/70 hover:bg-slack-sidebar-hover hover:text-white"
                >
                  <Plus className="w-5 h-5 flex-shrink-0" />
                  <span>Add teammates</span>
                </button>
              </div>
            )}
          </div>
        </div>
        {/* HuddleBar now rendered globally in App.tsx for mobile visibility */}
      </div>

      {/* Add Channel Dialog (Create + Browse) */}
      <AddChannelDialog
        open={showAddChannelDialog}
        onClose={() => setShowAddChannelDialog(false)}
        onCreateChannel={handleCreateChannel}
        browseChannels={browseChannels}
        onJoinChannel={handleJoinChannel}
        onNavigateToChannel={(channelId) => {
          setShowAddChannelDialog(false);
          navTo(`/c/${channelId}`);
        }}
        onBrowse={handleBrowseChannels}
      />

      {/* Add Teammates Dialog */}
      <AddTeammatesDialog
        open={showAddTeammates}
        onClose={() => setShowAddTeammates(false)}
        onSelectUser={handleSelectUser}
      />
    </div>
  );
}
