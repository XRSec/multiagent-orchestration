/**
 * Purpose: Hook for session state management backed by /api/sessions and localStorage.
 * Context: Replaces ephemeral mock sessions with persistent real data across pages and reloads.
 * Usage: const { sessions, createSession, updateSession, deleteSession, pinSession, forkSession } = useSessions();
 * Prerequisites: React 19, /api/sessions endpoint.
 */

import { useState, useEffect, useCallback } from 'react';
import type { PersistentSession } from '@/types/session';

const LOCAL_STORAGE_KEY = 'cindy_persistent_sessions_v1';

export function useSessions() {
  const [sessions, setSessions] = useState<PersistentSession[]>(() => {
    try {
      const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  });
  const [loading, setLoading] = useState(true);

  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/sessions');
      const data = await res.json();
      if (data.ok && Array.isArray(data.sessions)) {
        setSessions(data.sessions);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data.sessions));
      }
    } catch (err) {
      console.warn('Failed to fetch /api/sessions, using cached local data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const updateAndSave = (newList: PersistentSession[]) => {
    setSessions(newList);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newList));
    } catch {}
  };

  const createSession = async (sessionData: Partial<PersistentSession>) => {
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionData)
      });
      const data = await res.json();
      if (data.ok && data.session) {
        if (Array.isArray(data.sessions)) {
          updateAndSave(data.sessions);
        } else {
          updateAndSave([data.session, ...sessions]);
        }
        return data.session as PersistentSession;
      }
    } catch {
      // Local fallback
    }
    const fallbackNew: PersistentSession = {
      id: sessionData.id || `s-${Date.now()}`,
      title: sessionData.title || '新会话',
      workingDir: sessionData.workingDir || '/Users/xr/workspace',
      agentKind: sessionData.agentKind || 'claude-code',
      model: sessionData.model || 'claude-fable-5[1M]',
      effort: sessionData.effort || 'high',
      isPinned: Boolean(sessionData.isPinned),
      isMuted: Boolean(sessionData.isMuted),
      status: 'idle',
      updatedAt: '刚刚',
      messageCount: 0,
      tags: sessionData.tags || [],
      tagColor: sessionData.tagColor,
      archived: false,
      forkedFromId: sessionData.forkedFromId
    };
    updateAndSave([fallbackNew, ...sessions]);
    return fallbackNew;
  };

  const updateSession = async (id: string, updates: Partial<PersistentSession>) => {
    const nextList = sessions.map((s) => (s.id === id ? { ...s, ...updates, updatedAt: '刚刚' } : s));
    updateAndSave(nextList);

    try {
      await fetch(`/api/sessions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
    } catch {}
  };

  const deleteSession = async (id: string) => {
    const nextList = sessions.filter((s) => s.id !== id);
    updateAndSave(nextList);

    try {
      await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
    } catch {}
  };

  const togglePin = async (session: PersistentSession) => {
    await updateSession(session.id, { isPinned: !session.isPinned });
  };

  const toggleMute = async (session: PersistentSession) => {
    await updateSession(session.id, { isMuted: !session.isMuted });
  };

  const setTagColor = async (session: PersistentSession, colorHex: string | null) => {
    await updateSession(session.id, { tagColor: colorHex || undefined });
  };

  const renameSession = async (session: PersistentSession, newTitle: string) => {
    if (!newTitle.trim()) return;
    await updateSession(session.id, { title: newTitle.trim() });
  };

  const toggleArchive = async (session: PersistentSession) => {
    await updateSession(session.id, { archived: !session.archived });
  };

  const forkSession = async (sourceSession: PersistentSession, customTitle?: string) => {
    const forked = await createSession({
      title: customTitle || `${sourceSession.title} (分叉)`,
      workingDir: sourceSession.workingDir,
      agentKind: sourceSession.agentKind,
      model: sourceSession.model,
      effort: sourceSession.effort,
      tags: [...(sourceSession.tags || []), '分叉'],
      tagColor: sourceSession.tagColor,
      forkedFromId: sourceSession.id
    });
    return forked;
  };

  return {
    sessions,
    loading,
    refresh: fetchSessions,
    createSession,
    updateSession,
    deleteSession,
    togglePin,
    toggleMute,
    setTagColor,
    renameSession,
    toggleArchive,
    forkSession
  };
}
