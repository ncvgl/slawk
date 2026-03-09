import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Sidebar } from '@/components/Sidebar/Sidebar';
import { MessageArea } from '@/components/Messages/MessageArea';
import { ProfileModal } from '@/components/ProfileModal';
import { useProfileStore } from '@/stores/useProfileStore';
import { useMobileStore } from '@/stores/useMobileStore';
import { AdminPage } from '@/components/Admin/AdminPage';
import { FilesPage } from '@/components/Messages/FilesPage';
import { LaterPage } from '@/components/Messages/LaterPage';

export function AppLayout() {
  const { isOpen, userId, closeProfile } = useProfileStore();
  const { sidebarOpen, closeSidebar } = useMobileStore();
  const location = useLocation();

  // Prevent background scroll when mobile sidebar is open
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [sidebarOpen]);

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
      {/* Mobile sidebar overlay backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* Left Sidebar — always visible on md+, overlay on mobile when open */}
      <div
        className={`
          fixed inset-y-0 left-0 z-50 flex
          transition-transform duration-200 ease-in-out motion-reduce:transition-none
          md:static md:translate-x-0 md:transition-none
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <Sidebar />
      </div>

      {/* Main Content Area */}
      <main className="flex flex-1 flex-col min-w-0 min-h-0 overflow-hidden border-l border-slack-border">
        {content}
      </main>

      {/* Profile Modal */}
      {isOpen && <ProfileModal userId={userId} onClose={closeProfile} />}
    </div>
  );
}
