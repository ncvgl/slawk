import { useState } from 'react';
import { Copy, Trash2, Check } from 'lucide-react';
import { useAdminStore } from '@/stores/useAdminStore';

const ROLE_BADGE: Record<string, { label: string; className: string }> = {
  ADMIN: { label: 'Admin', className: 'bg-purple-100 text-purple-700' },
  MEMBER: { label: 'Member', className: 'bg-blue-100 text-blue-700' },
  GUEST: { label: 'Guest', className: 'bg-gray-100 text-gray-600' },
};

const EXPIRY_OPTIONS = [
  { label: '1 day', value: '1d' },
  { label: '7 days', value: '7d' },
  { label: '30 days', value: '30d' },
  { label: 'Never', value: 'never' },
];

function getExpiresAt(value: string): string | null {
  if (value === 'never') return null;
  const days = parseInt(value);
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export function AdminInvitesTab() {
  const { invites, createInvite, deleteInvite } = useAdminStore();
  const [role, setRole] = useState<'MEMBER' | 'GUEST'>('MEMBER');
  const [maxUses, setMaxUses] = useState('');
  const [expiry, setExpiry] = useState('7d');
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const handleCreate = async () => {
    await createInvite({
      role,
      maxUses: maxUses ? parseInt(maxUses) : null,
      expiresAt: getExpiresAt(expiry),
    });
  };

  const copyUrl = (code: string, id: number) => {
    const url = `${window.location.origin}/register?invite=${code}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatExpiry = (expiresAt: string | null) => {
    if (!expiresAt) return 'Never';
    const date = new Date(expiresAt);
    if (date < new Date()) return 'Expired';
    return date.toLocaleDateString();
  };

  return (
    <div>
      {/* Create Form */}
      <div className="mb-6 rounded-lg border border-slack-border p-4">
        <h3 className="text-sm font-semibold text-slack-primary mb-3">Create invite link</h3>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-xs text-slack-secondary mb-1">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'MEMBER' | 'GUEST')}
              className="rounded border border-slack-border px-3 py-1.5 text-sm focus:border-slack-focus focus:outline-none"
            >
              <option value="MEMBER">Member</option>
              <option value="GUEST">Guest</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slack-secondary mb-1">Max uses</label>
            <input
              type="number"
              min="1"
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              placeholder="Unlimited"
              className="w-28 rounded border border-slack-border px-3 py-1.5 text-sm focus:border-slack-focus focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-slack-secondary mb-1">Expires in</label>
            <select
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              className="rounded border border-slack-border px-3 py-1.5 text-sm focus:border-slack-focus focus:outline-none"
            >
              {EXPIRY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleCreate}
            className="rounded-lg bg-slack-btn px-4 py-1.5 text-sm font-medium text-white hover:bg-slack-btn-hover"
          >
            Create
          </button>
        </div>
      </div>

      {/* Invite List */}
      <div className="rounded-lg border border-slack-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-slack-border">
              <th className="text-left px-4 py-2.5 font-medium text-slack-secondary">Invite URL</th>
              <th className="text-left px-4 py-2.5 font-medium text-slack-secondary">Role</th>
              <th className="text-left px-4 py-2.5 font-medium text-slack-secondary">Uses</th>
              <th className="text-left px-4 py-2.5 font-medium text-slack-secondary">Expires</th>
              <th className="text-left px-4 py-2.5 font-medium text-slack-secondary">Created by</th>
              <th className="text-right px-4 py-2.5 font-medium text-slack-secondary"></th>
            </tr>
          </thead>
          <tbody>
            {invites.map((invite) => {
              const badge = ROLE_BADGE[invite.role] || ROLE_BADGE.MEMBER;
              const isExpired = invite.expiresAt && new Date(invite.expiresAt) < new Date();
              const isExhausted = invite.maxUses !== null && invite.useCount >= invite.maxUses;

              return (
                <tr key={invite.id} className="border-b border-slack-border last:border-b-0 hover:bg-gray-50/50">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-gray-100 rounded px-1.5 py-0.5 max-w-[200px] truncate">
                        {invite.code.slice(0, 16)}...
                      </code>
                      <button
                        onClick={() => copyUrl(invite.code, invite.id)}
                        className="text-slack-hint hover:text-slack-primary"
                        title="Copy invite URL"
                      >
                        {copiedId === invite.id ? (
                          <Check className="h-3.5 w-3.5 text-green-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}>
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slack-secondary">
                    {invite.useCount}{invite.maxUses !== null ? ` / ${invite.maxUses}` : ''}
                    {isExhausted && <span className="ml-1 text-red-500 text-xs">(full)</span>}
                  </td>
                  <td className="px-4 py-2.5 text-slack-secondary">
                    <span className={isExpired ? 'text-red-500' : ''}>
                      {formatExpiry(invite.expiresAt)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slack-secondary">{invite.creator.name}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => deleteInvite(invite.id)}
                      className="text-slack-hint hover:text-red-600"
                      title="Delete invite"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {invites.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-slack-hint">No invite links yet</div>
        )}
      </div>
    </div>
  );
}
