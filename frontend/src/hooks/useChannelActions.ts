import { useState, useRef, useCallback, useEffect } from 'react';
import { getUsers, type AuthUser } from '@/lib/api';
import { useAuthStore } from '@/stores/useAuthStore';

export function useChannelActions() {
  const [teammates, setTeammates] = useState<AuthUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { user } = useAuthStore();

  const fetchTeammates = useCallback(
    async (search?: string) => {
      setIsSearching(true);
      try {
        const allUsers = await getUsers(search);
        // Put current user first (self-DM), then others
        const self = allUsers.filter((u) => u.id === user?.id);
        const others = allUsers.filter((u) => u.id !== user?.id);
        setTeammates([...self, ...others]);
      } catch {
        // ignore
      } finally {
        setIsSearching(false);
      }
    },
    [user?.id]
  );

  const searchTeammates = useCallback(
    (query: string) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      if (query === '') {
        // No debounce for empty query (initial load)
        fetchTeammates(undefined);
        return;
      }

      timeoutRef.current = setTimeout(() => {
        fetchTeammates(query);
      }, 300);
    },
    [fetchTeammates]
  );

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return { teammates, isSearching, searchTeammates };
}
