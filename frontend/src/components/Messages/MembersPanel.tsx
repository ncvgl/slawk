import { useState, useEffect, useRef } from 'react';
import { X, UserPlus } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { getChannelMembers, getUsers, addChannelMember, type ChannelMember, type AuthUser } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { Button } from '@/components/ui/button';
import { ProfileModal } from '@/components/ProfileModal';

interface MembersPanelProps {
  channelId: number;
  onClose: () => void;
}

export function MembersPanel({ channelId, onClose }: MembersPanelProps) {
  const [members, setMembers] = useState<ChannelMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [profileUserId, setProfileUserId] = useState<number | null>(null);

  const fetchMembers = () => {
    setIsLoading(true);
    getChannelMembers(channelId)
      .then((data) => {
        setMembers(data);
        setLoadError(null);
      })
      .catch(() => setLoadError('Failed to load members.'))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchMembers();
  }, [channelId]);

  // Listen for real-time presence updates
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handlePresenceUpdate = (data: { userId: number; status: string }) => {
      setMembers((prev) =>
        prev.map((m) =>
          m.user.id === data.userId
            ? {
                ...m,
                user: {
                  ...m.user,
                  status: data.status,
                  isOnline: data.status === 'online',
                },
              }
            : m
        )
      );
    };

    socket.on('presence:update', handlePresenceUpdate);
    return () => {
      socket.off('presence:update', handlePresenceUpdate);
    };
  }, []);

  const onlineMembers = members.filter((m) => m.user.isOnline);
  const offlineMembers = members.filter((m) => !m.user.isOnline);
  const memberUserIds = new Set(members.map((m) => m.user.id));

  return (
    <div
      data-testid="members-panel"
      className="flex w-[260px] flex-col border-l border-slack-border bg-white"
    >
      <div className="flex h-[49px] items-center justify-between border-b border-slack-border px-4">
        <h3 className="text-[15px] font-bold text-slack-primary">Members</h3>
        <Button variant="toolbar" size="icon-sm" onClick={onClose}>
          <X className="h-4 w-4 text-slack-secondary" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {/* Add People button */}
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-[14px] text-slack-link hover:bg-slack-hover mb-2"
        >
          <UserPlus className="h-4 w-4" />
          Add people
        </button>

        {showAddForm && (
          <AddPeopleForm
            channelId={channelId}
            memberUserIds={memberUserIds}
            onAdded={() => {
              setShowAddForm(false);
              fetchMembers();
            }}
            onCancel={() => setShowAddForm(false)}
          />
        )}

        {isLoading ? (
          <div className="text-center text-sm text-slack-hint py-4">Loading...</div>
        ) : loadError ? (
          <div className="text-center text-sm text-slack-error py-4">{loadError}</div>
        ) : (
          <>
            {onlineMembers.length > 0 && (
              <div data-testid="online-members" className="mb-4">
                <h4 className="mb-2 text-[12px] font-medium text-slack-secondary uppercase tracking-wide">
                  Online — {onlineMembers.length}
                </h4>
                {onlineMembers.map((m) => (
                  <MemberRow key={m.user.id} member={m} onClick={() => setProfileUserId(m.user.id)} />
                ))}
              </div>
            )}

            {offlineMembers.length > 0 && (
              <div data-testid="offline-members">
                <h4 className="mb-2 text-[12px] font-medium text-slack-secondary uppercase tracking-wide">
                  Offline — {offlineMembers.length}
                </h4>
                {offlineMembers.map((m) => (
                  <MemberRow key={m.user.id} member={m} onClick={() => setProfileUserId(m.user.id)} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
      {profileUserId !== null && (
        <ProfileModal userId={profileUserId} onClose={() => setProfileUserId(null)} />
      )}
    </div>
  );
}

function AddPeopleForm({
  channelId,
  memberUserIds,
  onAdded,
  onCancel,
}: {
  channelId: number;
  memberUserIds: Set<number>;
  onAdded: () => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AuthUser[]>([]);
  const [adding, setAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (query.length < 1) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const users = await getUsers(query);
        setResults(users.filter((u) => !memberUserIds.has(u.id)));
      } catch { /* ignore */ }
    }, 200);
    return () => clearTimeout(timer);
  }, [query, memberUserIds]);

  const handleAdd = async (userId: number) => {
    setAdding(true);
    try {
      await addChannelMember(channelId, userId);
      onAdded();
    } catch {
      setAdding(false);
    }
  };

  return (
    <div className="mb-3 rounded border border-slack-border p-2">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name..."
        className="w-full rounded border border-slack-border px-2 py-1 text-[13px] outline-none focus:border-slack-link"
      />
      {results.length > 0 && (
        <div className="mt-1 max-h-[150px] overflow-y-auto">
          {results.map((user) => (
            <button
              key={user.id}
              disabled={adding}
              onClick={() => handleAdd(user.id)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-slack-hover disabled:opacity-50"
            >
              <Avatar
                src={user.avatar}
                alt={user.name}
                fallback={user.name}
                size="sm"
              />
              <span className="text-[13px] text-slack-primary truncate">{user.name}</span>
            </button>
          ))}
        </div>
      )}
      {query.length > 0 && results.length === 0 && (
        <div className="mt-1 text-[12px] text-slack-hint px-2">No users found</div>
      )}
      <button
        onClick={onCancel}
        className="mt-1 text-[12px] text-slack-secondary hover:underline"
      >
        Cancel
      </button>
    </div>
  );
}

function MemberRow({ member, onClick }: { member: ChannelMember; onClick?: () => void }) {
  return (
    <button
      data-testid={`member-row-${member.user.id}`}
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 hover:bg-slack-hover cursor-pointer">
      <Avatar
        src={member.user.avatar}
        alt={member.user.name}
        fallback={member.user.name}
        size="sm"
        status={member.user.isOnline ? 'online' : 'offline'}
      />
      <span className="text-[14px] text-slack-primary truncate">{member.user.name}</span>
    </button>
  );
}
