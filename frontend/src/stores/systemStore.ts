import { create } from 'zustand';
import type { SystemInfo } from '../types/system';

const MAX_HISTORY = 300;

interface SystemState {
  system: SystemInfo | null;
  history: SystemInfo[];
  connected: boolean;
  setSystem: (data: SystemInfo) => void;
  setConnected: (val: boolean) => void;
  clearHistory: () => void;
}

export const useSystemStore = create<SystemState>((set) => ({
  system: null,
  history: [],
  connected: false,

  setSystem: (data: SystemInfo) =>
    set((state) => {
      const newHistory = [...state.history, data];
      if (newHistory.length > MAX_HISTORY) {
        newHistory.splice(0, newHistory.length - MAX_HISTORY);
      }
      return { system: data, history: newHistory };
    }),

  setConnected: (val: boolean) => set({ connected: val }),

  clearHistory: () => set({ history: [] }),
}));
