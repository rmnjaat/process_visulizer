import { useEffect, useRef } from 'react';
import { useSystemStore } from '../stores/systemStore';
import { useAlertStore } from '../stores/alertStore';

const COOLDOWN_MS = 30_000;

export function useAlerts() {
  const lastCpuAlert = useRef(0);
  const lastMemoryAlert = useRef(0);

  useEffect(() => {
    // Subscribe to system store changes outside of React render cycle
    const unsubscribe = useSystemStore.subscribe((state) => {
      const { alertsEnabled, cpuThreshold, memoryThreshold } = useAlertStore.getState();

      if (!alertsEnabled || !state.system) return;
      if (Notification.permission !== 'granted') return;

      const now = Date.now();
      const cpuUsage = state.system.cpu.total_usage;
      const memUsage = state.system.memory.percent;

      // CPU threshold check with cooldown
      if (cpuUsage >= cpuThreshold && now - lastCpuAlert.current > COOLDOWN_MS) {
        lastCpuAlert.current = now;
        new Notification('CPU Alert', {
          body: `CPU usage at ${cpuUsage.toFixed(1)}% (threshold: ${cpuThreshold}%)`,
          icon: '/vite.svg',
          tag: 'cpu-alert',
        });
      }

      // Memory threshold check with cooldown
      if (memUsage >= memoryThreshold && now - lastMemoryAlert.current > COOLDOWN_MS) {
        lastMemoryAlert.current = now;
        new Notification('Memory Alert', {
          body: `Memory usage at ${memUsage.toFixed(1)}% (threshold: ${memoryThreshold}%)`,
          icon: '/vite.svg',
          tag: 'memory-alert',
        });
      }
    });

    return () => unsubscribe();
  }, []);
}
