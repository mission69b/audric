'use client';

import { useCallback, useSyncExternalStore } from 'react';

export type PanelId =
  | 'chat'
  | 'portfolio'
  | 'activity'
  | 'pay'
  | 'automations'
  | 'goals'
  | 'reports'
  | 'contacts'
  | 'store'
  | 'settings';

const PANEL_URL_MAP: Record<PanelId, string> = {
  chat: '/new',
  portfolio: '/portfolio',
  activity: '/activity',
  pay: '/pay',
  automations: '/automations',
  goals: '/goals',
  reports: '/reports',
  contacts: '/contacts',
  store: '/store',
  settings: '/settings',
};

let currentPanel: PanelId = 'chat';
const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return currentPanel;
}

function getServerSnapshot() {
  return 'chat' as PanelId;
}

export function usePanel() {
  const panel = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setPanel = useCallback((id: PanelId) => {
    if (id === currentPanel) return;
    currentPanel = id;
    const url = PANEL_URL_MAP[id];
    window.history.pushState({ panel: id }, '', url);
    emitChange();
  }, []);

  const navigateToChat = useCallback((prefill?: string) => {
    currentPanel = 'chat';
    const url = prefill ? `/new?prefill=${encodeURIComponent(prefill)}` : '/new';
    window.history.pushState({ panel: 'chat' }, '', url);
    emitChange();
  }, []);

  return { panel, setPanel, navigateToChat };
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', (e) => {
    const state = e.state as { panel?: PanelId } | null;
    if (state?.panel && state.panel !== currentPanel) {
      currentPanel = state.panel;
      emitChange();
    }
  });
}
