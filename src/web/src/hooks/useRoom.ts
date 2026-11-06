/**
 * Purpose: Hook for fetching and synchronizing room details and room list from /api/rooms.
 * Context: Keeps room metadata, charters, and watermarks synchronized with filesystem state.
 * Usage: const { currentRoom, allRooms, charter, memory, loading, refreshRoom } = useRoom(groupId);
 * Prerequisites: React 19, /api/rooms endpoints.
 */

import { useEffect, useState, useCallback } from 'react';
import type { GroupRecord } from '@/types/room';

export function useRoom(groupId: string) {
  const [currentRoom, setCurrentRoom] = useState<GroupRecord | null>(null);
  const [allRooms, setAllRooms] = useState<GroupRecord[]>([]);
  const [charter, setCharter] = useState<string>('');
  const [memory, setMemory] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAllRooms = useCallback(async () => {
    try {
      const res = await fetch('/api/rooms');
      const data = await res.json();
      if (data.ok && Array.isArray(data.rooms)) {
        setAllRooms(data.rooms);
      }
    } catch {
      // Ignore background refresh errors
    }
  }, []);

  const fetchRoomDetails = useCallback(async (slug: string) => {
    if (!slug) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/rooms/${encodeURIComponent(slug)}`);
      const data = await res.json();
      if (data.ok && data.room) {
        setCurrentRoom(data.room);
        setCharter(data.charter || '');
        setMemory(data.memory || '');
        setError(null);
      } else {
        setError(data.error || `Room ${slug} not found`);
      }
    } catch (err: any) {
      setError(err?.message || 'Network error fetching room');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllRooms();
  }, [fetchAllRooms]);

  useEffect(() => {
    if (groupId) {
      fetchRoomDetails(groupId);
    }
  }, [groupId, fetchRoomDetails]);

  return {
    currentRoom,
    allRooms,
    charter,
    memory,
    loading,
    error,
    refreshRoom: () => fetchRoomDetails(groupId),
    refreshAllRooms: fetchAllRooms
  };
}
