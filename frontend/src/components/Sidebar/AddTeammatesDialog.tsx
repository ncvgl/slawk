import { useState, useEffect } from 'react';
import { useChannelActions } from '@/hooks/useChannelActions';
import { useAuthStore } from '@/stores/useAuthStore';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import type { AuthUser } from '@/lib/api';

interface AddTeammatesDialogProps {
  open: boolean;
  onClose: () => void;
  onSelectUser: (user: AuthUser) => void;
}

export function AddTeammatesDialog({
  open,
  onClose,
  onSelectUser,
}: AddTeammatesDialogProps) {
  const [teammateSearch, setTeammateSearch] = useState('');
  const { teammates, searchTeammates } = useChannelActions();
  const currentUser = useAuthStore((s) => s.user);

  // Load all teammates when dialog opens
  useEffect(() => {
    if (open) {
      setTeammateSearch('');
      searchTeammates('');
    }
  }, [open, searchTeammates]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[480px] rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-[22px] font-bold text-slack-primary mb-2">Direct message</h2>
        <p className="text-[14px] text-slack-hint mb-4">Find or start a conversation</p>
        <input
          data-testid="teammate-search"
          type="text"
          value={teammateSearch}
          onChange={(e) => {
            setTeammateSearch(e.target.value);
            searchTeammates(e.target.value);
          }}
          placeholder="Search by name..."
          autoFocus
          className="w-full rounded border border-slack-input-border px-3 py-2 text-[15px] text-slack-primary outline-none focus:border-slack-link focus:ring-1 focus:ring-slack-link mb-3"
        />
        {teammates.length === 0 ? (
          <p className="text-center text-slack-hint py-4">No users found</p>
        ) : (
          <div className="max-h-[300px] overflow-y-auto space-y-1">
            {teammates.map((u) => (
              <button
                key={u.id}
                onClick={() => onSelectUser(u)}
                className="flex w-full items-center gap-3 rounded px-3 py-2 hover:bg-slack-hover text-left"
              >
                <Avatar
                  src={u.avatar ?? undefined}
                  alt={u.name}
                  fallback={u.name}
                  size="md"
                />
                <div>
                  <p className="text-[14px] font-medium text-slack-primary">
                    {u.name}{u.id === currentUser?.id && <span className="text-slack-hint font-normal"> (you)</span>}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
