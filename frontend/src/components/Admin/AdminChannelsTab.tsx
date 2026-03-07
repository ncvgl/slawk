import { useState } from 'react';
import { Lock, Hash, Trash2 } from 'lucide-react';
import { useAdminStore } from '@/stores/useAdminStore';
import { ConfirmDialog } from './ConfirmDialog';

export function AdminChannelsTab() {
  const { channels, deleteChannel } = useAdminStore();
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <div>
      <div className="rounded-lg border border-slack-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-slack-border">
              <th className="text-left px-4 py-2.5 font-medium text-slack-secondary">Channel</th>
              <th className="text-left px-4 py-2.5 font-medium text-slack-secondary">Members</th>
              <th className="text-left px-4 py-2.5 font-medium text-slack-secondary">Messages</th>
              <th className="text-left px-4 py-2.5 font-medium text-slack-secondary">Created</th>
              <th className="text-right px-4 py-2.5 font-medium text-slack-secondary"></th>
            </tr>
          </thead>
          <tbody>
            {channels.map((channel) => (
              <tr key={channel.id} className="border-b border-slack-border last:border-b-0 hover:bg-gray-50/50">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    {channel.isPrivate ? (
                      <Lock className="h-3.5 w-3.5 text-slack-hint" />
                    ) : (
                      <Hash className="h-3.5 w-3.5 text-slack-hint" />
                    )}
                    <span className="font-medium text-slack-primary">{channel.name}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-slack-secondary">{channel._count.members}</td>
                <td className="px-4 py-2.5 text-slack-secondary">{channel._count.messages}</td>
                <td className="px-4 py-2.5 text-slack-secondary">{formatDate(channel.createdAt)}</td>
                <td className="px-4 py-2.5 text-right">
                  <button
                    onClick={() => setDeleteTarget({ id: channel.id, name: channel.name })}
                    className="text-slack-hint hover:text-red-600"
                    title="Delete channel"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {channels.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-slack-hint">No channels</div>
        )}
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="Delete channel"
          message={`Are you sure you want to delete #${deleteTarget.name}? All messages in this channel will be permanently deleted. This can't be undone.`}
          confirmLabel="Delete"
          onConfirm={() => {
            deleteChannel(deleteTarget.id);
            setDeleteTarget(null);
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
