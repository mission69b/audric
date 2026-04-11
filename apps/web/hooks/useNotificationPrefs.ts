'use client';

import { useState, useEffect, useCallback } from 'react';

type Feature = 'hf_alert' | 'briefing' | 'rate_alert' | 'auto_compound';

const DEFAULT_PREFS: Record<Feature, boolean> = {
  hf_alert: true,
  briefing: true,
  rate_alert: true,
  auto_compound: false,
};

interface UseNotificationPrefsResult {
  prefs: Record<Feature, boolean>;
  loading: boolean;
  toggling: Feature | null;
  toggle: (feature: Feature) => Promise<void>;
}

export function useNotificationPrefs(
  address: string | null,
  jwt: string | null,
): UseNotificationPrefsResult {
  const [prefs, setPrefs] = useState<Record<Feature, boolean>>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<Feature | null>(null);

  useEffect(() => {
    if (!address || !jwt) {
      setLoading(false);
      return;
    }

    fetch(`/api/user/notification-prefs?address=${address}`, {
      headers: { 'x-zklogin-jwt': jwt },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.prefs) setPrefs(data.prefs);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [address, jwt]);

  const toggle = useCallback(
    async (feature: Feature) => {
      if (!address || !jwt || toggling) return;

      const newValue = !prefs[feature];
      setToggling(feature);
      setPrefs((prev) => ({ ...prev, [feature]: newValue }));

      try {
        const res = await fetch('/api/user/notification-prefs', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-zklogin-jwt': jwt,
          },
          body: JSON.stringify({ address, feature, enabled: newValue }),
        });

        if (!res.ok) {
          setPrefs((prev) => ({ ...prev, [feature]: !newValue }));
        }
      } catch {
        setPrefs((prev) => ({ ...prev, [feature]: !newValue }));
      } finally {
        setToggling(null);
      }
    },
    [address, jwt, prefs, toggling],
  );

  return { prefs, loading, toggling, toggle };
}
