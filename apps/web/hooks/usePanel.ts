'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';

// [SIMPLIFICATION DAY 11] Dropped 'automations' + 'reports' panel ids.
// Both panels were no-ops since S.5; the sidebar entries are gone now.
// Old deep-links (`/automations`, `/reports`) silently fall through to
// chat via panelFromUrl()'s `URL_PANEL_MAP[pathname] ?? 'chat'` default.
export type PanelId =
  | 'chat'
  | 'portfolio'
  | 'activity'
  | 'pay'
  | 'goals'
  | 'contacts'
  | 'store'
  | 'settings';

const PANEL_URL_MAP: Record<PanelId, string> = {
  chat: '/new',
  portfolio: '/portfolio',
  activity: '/activity',
  pay: '/pay',
  goals: '/goals',
  contacts: '/contacts',
  store: '/store',
  settings: '/settings',
};

const URL_PANEL_MAP: Record<string, PanelId> = Object.fromEntries(
  Object.entries(PANEL_URL_MAP).map(([id, url]) => [url, id as PanelId]),
);

function panelFromUrl(): PanelId {
  if (typeof window === 'undefined') return 'chat';
  const { pathname, searchParams } = new URL(window.location.href);
  const paramPanel = searchParams.get('panel');
  if (paramPanel && paramPanel in URL_PANEL_MAP_REVERSE) return paramPanel as PanelId;
  if (pathname.startsWith('/chat/')) return 'chat';
  return URL_PANEL_MAP[pathname] ?? 'chat';
}

const URL_PANEL_MAP_REVERSE = Object.fromEntries(
  (Object.keys(PANEL_URL_MAP) as PanelId[]).map((id) => [id, true]),
);

let currentPanel: PanelId = panelFromUrl();
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
  const pathname = usePathname();
  const panel = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    const urlPanel = panelFromUrl();
    if (urlPanel !== currentPanel) {
      currentPanel = urlPanel;
      emitChange();
    }
  }, [pathname]);

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
    const next = state?.panel ?? panelFromUrl();
    if (next !== currentPanel) {
      currentPanel = next;
      emitChange();
    }
  });
}
