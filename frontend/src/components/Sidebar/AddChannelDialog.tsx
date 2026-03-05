import { useState, useEffect } from 'react';
import { Hash, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { Channel } from '@/lib/types';

interface AddChannelDialogProps {
  open: boolean;
  onClose: () => void;
  onCreateChannel: (name: string, isPrivate?: boolean) => Promise<void>;
  browseChannels: Channel[];
  onJoinChannel: (channelId: number) => Promise<void>;
  onNavigateToChannel: (channelId: number) => void;
  onBrowse: () => void;
}

export function AddChannelDialog({
  open,
  onClose,
  onCreateChannel,
  browseChannels,
  onJoinChannel,
  onNavigateToChannel,
  onBrowse,
}: AddChannelDialogProps) {
  const [addChannelMode, setAddChannelMode] = useState<'create' | 'browse'>('create');
  const [newChannelName, setNewChannelName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [createChannelError, setCreateChannelError] = useState('');

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setAddChannelMode('create');
      setNewChannelName('');
      setIsPrivate(false);
      setCreateChannelError('');
    }
  }, [open]);

  if (!open) return null;

  const handleClose = () => {
    setNewChannelName('');
    setCreateChannelError('');
    onClose();
  };

  const handleBrowse = () => {
    setAddChannelMode('browse');
    onBrowse();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[520px] rounded-lg bg-white shadow-xl">
        {/* Tabs */}
        <div className="flex border-b border-slack-border">
          <button
            onClick={() => setAddChannelMode('create')}
            className={cn(
              'flex-1 px-4 py-3 text-[14px] font-medium transition-colors',
              addChannelMode === 'create'
                ? 'border-b-2 border-slack-link text-slack-link'
                : 'text-slack-hint hover:text-slack-primary'
            )}
          >
            Create a channel
          </button>
          <button
            onClick={handleBrowse}
            className={cn(
              'flex-1 px-4 py-3 text-[14px] font-medium transition-colors',
              addChannelMode === 'browse'
                ? 'border-b-2 border-slack-link text-slack-link'
                : 'text-slack-hint hover:text-slack-primary'
            )}
          >
            Browse channels
          </button>
        </div>

        <div className="p-6">
          {addChannelMode === 'create' ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const name = newChannelName.trim();
                if (!name) return;
                try {
                  await onCreateChannel(name, isPrivate);
                  setNewChannelName('');
                  setCreateChannelError('');
                } catch {
                  setCreateChannelError('Channel name already exists');
                }
              }}
            >
              <label className="block text-[14px] font-medium text-slack-primary mb-1">
                Channel name
              </label>
              <input
                type="text"
                value={newChannelName}
                onChange={(e) => {
                  setNewChannelName(e.target.value);
                  if (createChannelError) setCreateChannelError('');
                }}
                placeholder="e.g. plan-budget"
                autoFocus
                className="w-full rounded border border-slack-input-border px-3 py-2 text-[15px] text-slack-primary outline-none focus:border-slack-link focus:ring-1 focus:ring-slack-link"
              />
              {createChannelError && (
                <p data-testid="channel-error" className="mt-1 text-[13px] text-slack-error">
                  {createChannelError}
                </p>
              )}

              <div className="mt-3">
                <label className="block text-[14px] font-medium text-slack-primary mb-2">
                  Visibility
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPrivate(false)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md border px-3 py-2 text-[13px] transition-colors',
                      !isPrivate
                        ? 'border-slack-link bg-slack-highlight text-slack-link font-medium'
                        : 'border-slack-border text-slack-secondary hover:border-slack-link'
                    )}
                  >
                    <Hash className="h-3.5 w-3.5" />
                    Public
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPrivate(true)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md border px-3 py-2 text-[13px] transition-colors',
                      isPrivate
                        ? 'border-slack-link bg-slack-highlight text-slack-link font-medium'
                        : 'border-slack-border text-slack-secondary hover:border-slack-link'
                    )}
                  >
                    <Lock className="h-3.5 w-3.5" />
                    Private
                  </button>
                </div>
                <p className="mt-1 text-[12px] text-slack-hint">
                  {isPrivate
                    ? 'Only invited members can find and join this channel.'
                    : 'Anyone in the workspace can find and join this channel.'}
                </p>
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <Button variant="ghost" type="button" onClick={handleClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!newChannelName.trim()}>
                  Create
                </Button>
              </div>
            </form>
          ) : (
            <div>
              {browseChannels.length === 0 ? (
                <p className="text-center text-slack-hint py-8">No channels available to join</p>
              ) : (
                <div className="max-h-[300px] overflow-y-auto space-y-1">
                  {browseChannels.map((ch) => (
                    <div
                      key={ch.id}
                      data-channel-name={ch.name}
                      className={cn(
                        "flex items-center justify-between rounded px-3 py-2 hover:bg-slack-hover",
                        ch.isMember && "cursor-pointer"
                      )}
                      onClick={() => {
                        if (ch.isMember) {
                          onNavigateToChannel(ch.id);
                          handleClose();
                        }
                      }}
                    >
                      <div className="flex items-center gap-2">
                        {ch.isPrivate ? <Lock className="h-3.5 w-3.5 text-slack-disabled" /> : <Hash className="h-3.5 w-3.5 text-slack-disabled" />}
                        <span className="text-[15px] text-slack-primary">{ch.name}</span>
                        <span className="text-[12px] text-slack-hint">{ch.memberCount} members</span>
                      </div>
                      {ch.isMember ? (
                        <span data-testid="joined-badge" className="text-[12px] text-slack-hint font-medium px-2 py-1">Joined</span>
                      ) : (
                        <Button size="sm" onClick={() => { onJoinChannel(ch.id).then(() => { onNavigateToChannel(ch.id); handleClose(); }); }}>
                          Join
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-4 flex justify-end">
                <Button variant="ghost" onClick={handleClose}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
