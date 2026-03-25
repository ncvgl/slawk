import { useState, useEffect } from 'react';
import { Shield, Users, Link2, Hash, Menu, ScrollText, Webhook } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdminStore } from '@/stores/useAdminStore';
import { useMobileStore } from '@/stores/useMobileStore';
import { AdminMembersTab } from './AdminMembersTab';
import { AdminInvitesTab } from './AdminInvitesTab';
import { AdminChannelsTab } from './AdminChannelsTab';
import { AdminWebhooksTab } from './AdminWebhooksTab';
import { AdminAuditLogTab } from './AdminAuditLogTab';

type Tab = 'members' | 'invites' | 'channels' | 'webhooks' | 'audit';

const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
  { id: 'members', label: 'Members', icon: Users },
  { id: 'invites', label: 'Invites', icon: Link2 },
  { id: 'channels', label: 'Channels', icon: Hash },
  { id: 'webhooks', label: 'Webhooks', icon: Webhook },
  { id: 'audit', label: 'Audit Log', icon: ScrollText },
];

export function AdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>('members');
  const { fetchUsers, fetchChannels, fetchInvites, fetchWebhooks } = useAdminStore();

  useEffect(() => {
    fetchUsers();
    fetchChannels();
    fetchInvites();
    fetchWebhooks();
  }, [fetchUsers, fetchChannels, fetchInvites, fetchWebhooks]);

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-slack-border px-6 py-3">
        <button
          onClick={useMobileStore.getState().openSidebar}
          className="mr-1 flex h-8 w-8 items-center justify-center rounded hover:bg-slack-hover md:hidden"
        >
          <Menu className="h-5 w-5 text-slack-secondary" />
        </button>
        <Shield className="h-5 w-5 text-slack-primary" />
        <h1 className="text-lg font-bold text-slack-primary">Admin Panel</h1>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto border-b border-slack-border px-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
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
        {activeTab === 'webhooks' && <AdminWebhooksTab />}
        {activeTab === 'audit' && <AdminAuditLogTab />}
      </div>
    </div>
  );
}
