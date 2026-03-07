import { useState, useEffect } from 'react';
import { Shield, Users, Link2, Hash } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdminStore } from '@/stores/useAdminStore';
import { AdminMembersTab } from './AdminMembersTab';
import { AdminInvitesTab } from './AdminInvitesTab';
import { AdminChannelsTab } from './AdminChannelsTab';

type Tab = 'members' | 'invites' | 'channels';

const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
  { id: 'members', label: 'Members', icon: Users },
  { id: 'invites', label: 'Invites', icon: Link2 },
  { id: 'channels', label: 'Channels', icon: Hash },
];

export function AdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>('members');
  const { fetchUsers, fetchChannels, fetchInvites } = useAdminStore();

  useEffect(() => {
    fetchUsers();
    fetchChannels();
    fetchInvites();
  }, [fetchUsers, fetchChannels, fetchInvites]);

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-slack-border px-6 py-3">
        <Shield className="h-5 w-5 text-slack-primary" />
        <h1 className="text-lg font-bold text-slack-primary">Admin Panel</h1>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slack-border px-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab.id
                ? 'border-slack-btn text-slack-btn'
                : 'border-transparent text-slack-secondary hover:text-slack-primary hover:border-gray-300'
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'members' && <AdminMembersTab />}
        {activeTab === 'invites' && <AdminInvitesTab />}
        {activeTab === 'channels' && <AdminChannelsTab />}
      </div>
    </div>
  );
}
