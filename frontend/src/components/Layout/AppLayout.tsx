import { useLocation } from 'react-router-dom';
import { Sidebar } from '@/components/Sidebar/Sidebar';
import { MessageArea } from '@/components/Messages/MessageArea';
import { ProfileModal } from '@/components/ProfileModal';
import { useProfileStore } from '@/stores/useProfileStore';
import { AdminPage } from '@/components/Admin/AdminPage';
import { FilesPage } from '@/components/Messages/FilesPage';
import { LaterPage } from '@/components/Messages/LaterPage';

export function AppLayout() {
  const { isOpen, userId, closeProfile } = useProfileStore();
  const location = useLocation();

  let content: React.ReactNode;
  if (location.pathname === '/admin') {
    content = <AdminPage />;
  } else if (location.pathname === '/files') {
    content = <FilesPage />;
  } else if (location.pathname === '/later') {
    content = <LaterPage />;
  } else {
    content = <MessageArea />;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white">
      {/* Left Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <main className="flex flex-1 flex-col min-w-0 border-l border-slack-border">
        {content}
      </main>

      {/* Profile Modal */}
      {isOpen && <ProfileModal userId={userId} onClose={closeProfile} />}
    </div>
  );
}
