import { Sidebar } from '@/components/Sidebar/Sidebar';
import { MessageArea } from '@/components/Messages/MessageArea';
import { ProfileModal } from '@/components/ProfileModal';
import { useProfileStore } from '@/stores/useProfileStore';

export function AppLayout() {
  const { isOpen, userId, closeProfile } = useProfileStore();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white">
      {/* Left Sidebar */}
      <Sidebar />

      {/* Main Message Area */}
      <main className="flex flex-1 flex-col min-w-0 border-l border-[#E0E0E0]">
        <MessageArea />
      </main>

      {/* Profile Modal */}
      {isOpen && <ProfileModal userId={userId} onClose={closeProfile} />}
    </div>
  );
}
