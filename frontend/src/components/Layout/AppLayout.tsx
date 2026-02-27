import { Sidebar } from '@/components/Sidebar/Sidebar';
import { MessageArea } from '@/components/Messages/MessageArea';

export function AppLayout() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white">
      {/* Left Sidebar */}
      <Sidebar />

      {/* Main Message Area */}
      <main className="flex flex-1 flex-col min-w-0">
        <MessageArea />
      </main>

      {/* Thread Panel (future) - would go here */}
    </div>
  );
}
