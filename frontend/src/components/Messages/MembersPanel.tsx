import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { getChannelMembers, type ChannelMember } from '@/lib/api';
import { getSocket } from '@/lib/socket';

interface MembersPanelProps {
  channelId: number;
  onClose: () => void;
}

export function MembersPanel({ channelId, onClose }: MembersPanelProps) {
  const [members, setMembers] = useState<ChannelMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    getChannelMembers(channelId)
      .then((data) => {
        if (!cancelled) setMembers(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
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

  return (
    <div
      data-testid="members-panel"
      className="flex w-[260px] flex-col border-l border-[#E0E0E0] bg-white"
    >
      <div className="flex h-[49px] items-center justify-between border-b border-[#E0E0E0] px-4">
        <h3 className="text-[15px] font-bold text-[#1D1C1D]">Members</h3>
        <button
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded hover:bg-[#F8F8F8]"
        >
          <X className="h-4 w-4 text-[#616061]" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="text-center text-sm text-gray-500 py-4">Loading...</div>
        ) : (
          <>
            {onlineMembers.length > 0 && (
              <div data-testid="online-members" className="mb-4">
                <h4 className="mb-2 text-[12px] font-medium text-[#616061] uppercase tracking-wide">
                  Online — {onlineMembers.length}
                </h4>
                {onlineMembers.map((m) => (
                  <MemberRow key={m.user.id} member={m} />
                ))}
              </div>
            )}

            {offlineMembers.length > 0 && (
              <div data-testid="offline-members">
                <h4 className="mb-2 text-[12px] font-medium text-[#616061] uppercase tracking-wide">
                  Offline — {offlineMembers.length}
                </h4>
                {offlineMembers.map((m) => (
                  <MemberRow key={m.user.id} member={m} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function MemberRow({ member }: { member: ChannelMember }) {
  return (
    <div className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-[#F8F8F8]">
      <Avatar
        src={member.user.avatar}
        alt={member.user.name}
        fallback={member.user.name}
        size="sm"
        status={member.user.isOnline ? 'online' : 'offline'}
      />
      <span className="text-[14px] text-[#1D1C1D] truncate">{member.user.name}</span>
    </div>
  );
}
