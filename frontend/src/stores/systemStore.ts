import { create } from 'zustand';
import type { SystemInfo } from '../types/system';

const MAX_HISTORY = 180; // 3 minutes at 1s refresh

interface SystemState {
  system: SystemInfo | null;
  history: SystemInfo[];
  connected: boolean;
  refreshInterval: number;
  setSystem: (data: SystemInfo) => void;
  setConnected: (val: boolean) => void;
  setRefreshInterval: (ms: number) => void;
  clearHistory: () => void;
}

export const useSystemStore = create<SystemState>((set) => ({
  system: null,
  history: [],
  connected: false,
  refreshInterval: 1000,

  setSystem: (data: SystemInfo) =>
    set((state) => {
      // Mutate array in-place, only create new reference for Zustand
      const h = state.history;
      h.push(data);
      if (h.length > MAX_HISTORY) h.shift();
      return { system: data, history: h };
    }),

  setConnected: (val: boolean) => set({ connected: val }),

  setRefreshInterval: (ms: number) => set({ refreshInterval: ms }),

  clearHistory: () => set({ history: [] }),
}));
