import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Sidebar } from '@/components/Sidebar/Sidebar';
import { MessageArea } from '@/components/Messages/MessageArea';
import { ProfileModal } from '@/components/ProfileModal';
import { useProfileStore } from '@/stores/useProfileStore';
import { useMobileStore } from '@/stores/useMobileStore';
import { useConnectionStore } from '@/stores/useConnectionStore';
import { AdminPage } from '@/components/Admin/AdminPage';
import { FilesPage } from '@/components/Messages/FilesPage';
import { LaterPage } from '@/components/Messages/LaterPage';

export function AppLayout() {
  const { isOpen, userId, closeProfile } = useProfileStore();
  const { sidebarOpen, closeSidebar } = useMobileStore();
  const isConnected = useConnectionStore((s) => s.isConnected);
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
    <div className="flex h-dvh w-screen overflow-hidden bg-white">
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
        {!isConnected && (
          <div className="flex items-center justify-center gap-2 bg-yellow-100 border-b border-yellow-300 px-3 py-1.5 text-[13px] text-yellow-800">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Reconnecting...
          </div>
        )}
        {content}
      </main>

      {/* Profile Modal */}
      {isOpen && <ProfileModal userId={userId} onClose={closeProfile} />}
    </div>
  );
}
