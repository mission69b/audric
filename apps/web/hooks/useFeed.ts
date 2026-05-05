'use client';

import { useCallback, useRef, useState } from 'react';
import { type FeedItem, type FeedItemData, createFeedItem } from '@/lib/feed-types';

export function useFeed() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const addItem = useCallback((data: FeedItemData) => {
    setItems((prev) => [...prev, createFeedItem(data)]);
  }, []);

  const addItems = useCallback((dataList: FeedItemData[]) => {
    setItems((prev) => [...prev, ...dataList.map(createFeedItem)]);
  }, []);

  const removeLastItem = useCallback(() => {
    setItems((prev) => prev.slice(0, -1));
  }, []);

  /**
   * Remove a feed item by id. Used by dismissable cards (e.g. the
   * `contact-prompt` ContactToast Skip path) so the item leaves the
   * feed instead of just fading to opacity-0 in place. No-op if the
   * id isn't present (idempotent — multiple Skip clicks are safe).
   */
  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const updateLastItem = useCallback((updater: (data: FeedItemData) => FeedItemData) => {
    setItems((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      return [...prev.slice(0, -1), { ...last, data: updater(last.data) }];
    });
  }, []);

  const updateLastOfType = useCallback((type: string, updater: (data: FeedItemData) => FeedItemData) => {
    setItems((prev) => {
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].data.type === type) {
          const updated = [...prev];
          updated[i] = { ...prev[i], data: updater(prev[i].data) };
          return updated;
        }
      }
      return prev;
    });
  }, []);

  const clear = useCallback(() => {
    setItems([]);
  }, []);

  return { items, addItem, addItems, removeLastItem, removeItem, updateLastItem, updateLastOfType, clear, scrollRef };
}
