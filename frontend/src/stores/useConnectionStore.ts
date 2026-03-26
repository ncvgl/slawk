import { create } from 'zustand';

interface ConnectionState {
  isConnected: boolean;
  setConnected: (connected: boolean) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  isConnected: true,
  setConnected: (connected) => set({ isConnected: connected }),
}));
