import { useEffect, useRef, useState } from 'react';
import { useProcessStore } from '../stores/processStore';

export interface IoRates {
  readBytesPerSec: number;
  writeBytesPerSec: number;
  readOpsPerSec: number;
  writeOpsPerSec: number;
}

interface IoSnapshot {
  io_read_bytes: number;
  io_write_bytes: number;
  io_read_count: number;
  io_write_count: number;
  timestamp: number;
}

const ZERO_RATES: IoRates = {
  readBytesPerSec: 0,
  writeBytesPerSec: 0,
  readOpsPerSec: 0,
  writeOpsPerSec: 0,
};

/**
 * Computes I/O rates (bytes/s, ops/s) for a given process by comparing
 * the current tick's cumulative I/O counters to the previous tick's values.
 */
export function useIoRates(pid: number): IoRates {
  const process = useProcessStore((s) => s.processes[pid]);
  const prevRef = useRef<IoSnapshot | null>(null);
  const [rates, setRates] = useState<IoRates>(ZERO_RATES);

  useEffect(() => {
    if (!process) {
      prevRef.current = null;
      setRates(ZERO_RATES);
      return;
    }

    const now = Date.now();
    const current: IoSnapshot = {
      io_read_bytes: process.io_read_bytes ?? 0,
      io_write_bytes: process.io_write_bytes ?? 0,
      io_read_count: process.io_read_count ?? 0,
      io_write_count: process.io_write_count ?? 0,
      timestamp: now,
    };

    const prev = prevRef.current;
    if (prev) {
      const dtMs = now - prev.timestamp;
      // Guard against zero or negative intervals
      if (dtMs > 0) {
        const dtSec = dtMs / 1000;
        const readBytesDelta = Math.max(0, current.io_read_bytes - prev.io_read_bytes);
        const writeBytesDelta = Math.max(0, current.io_write_bytes - prev.io_write_bytes);
        const readOpsDelta = Math.max(0, current.io_read_count - prev.io_read_count);
        const writeOpsDelta = Math.max(0, current.io_write_count - prev.io_write_count);

        setRates({
          readBytesPerSec: readBytesDelta / dtSec,
          writeBytesPerSec: writeBytesDelta / dtSec,
          readOpsPerSec: readOpsDelta / dtSec,
          writeOpsPerSec: writeOpsDelta / dtSec,
        });
      }
    }

    prevRef.current = current;
  }, [
    process?.io_read_bytes,
    process?.io_write_bytes,
    process?.io_read_count,
    process?.io_write_count,
  ]);

  return rates;
}
