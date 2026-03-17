import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AlertState {
  cpuThreshold: number;
  memoryThreshold: number;
  alertsEnabled: boolean;
  setCpuThreshold: (value: number) => void;
  setMemoryThreshold: (value: number) => void;
  toggleAlerts: () => void;
}

export const useAlertStore = create<AlertState>()(
  persist(
    (set) => ({
      cpuThreshold: 90,
      memoryThreshold: 85,
      alertsEnabled: false,

      setCpuThreshold: (value: number) => set({ cpuThreshold: value }),
      setMemoryThreshold: (value: number) => set({ memoryThreshold: value }),
      toggleAlerts: () => set((state) => ({ alertsEnabled: !state.alertsEnabled })),
    }),
    {
      name: 'process-visualizer-alerts',
    },
  ),
);
