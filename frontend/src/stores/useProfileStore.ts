import { create } from 'zustand';

interface ProfileState {
  isOpen: boolean;
  userId: number | undefined;
  openProfile: (userId?: number) => void;
  closeProfile: () => void;
}

export const useProfileStore = create<ProfileState>((set) => ({
  isOpen: false,
  userId: undefined,
  openProfile: (userId?: number) => set({ isOpen: true, userId }),
  closeProfile: () => set({ isOpen: false, userId: undefined }),
}));
