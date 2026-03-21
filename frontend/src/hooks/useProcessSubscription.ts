import { useEffect, useRef } from 'react';
import { sendWsMessage } from './useWebSocket';
import { useSystemStore } from '../stores/systemStore';
import { useProcessStore } from '../stores/processStore';

/**
 * Subscribes to real-time thread data for the given PID over WebSocket.
 *
 * Handles:
 * - Sending subscribe_process when a PID is selected
 * - Sending unsubscribe_process when PID changes or component unmounts
 * - Re-sending the subscribe after a WebSocket reconnect (connection goes
 *   from disconnected to connected while we still have an active PID)
 * - Clearing stale thread data from the store on unsubscribe
 */
export function useProcessSubscription(pid: number | null) {
  const connected = useSystemStore((s) => s.connected);
  const prevPidRef = useRef<number | null>(null);

  // Handle PID changes: unsubscribe old, subscribe new
  useEffect(() => {
    // Unsubscribe from the previous PID if it changed
    if (prevPidRef.current !== null && prevPidRef.current !== pid) {
      sendWsMessage({ action: 'unsubscribe_process', pid: prevPidRef.current });
      useProcessStore.getState().clearThreads(prevPidRef.current);
    }

    if (pid !== null) {
      sendWsMessage({ action: 'subscribe_process', pid });
    }

    prevPidRef.current = pid;

    return () => {
      if (prevPidRef.current !== null) {
        sendWsMessage({ action: 'unsubscribe_process', pid: prevPidRef.current });
        useProcessStore.getState().clearThreads(prevPidRef.current);
        prevPidRef.current = null;
      }
    };
  }, [pid]);

  // Re-subscribe after a WebSocket reconnect so the server knows which
  // PID we care about on the new connection.
  useEffect(() => {
    if (connected && prevPidRef.current !== null) {
      sendWsMessage({ action: 'subscribe_process', pid: prevPidRef.current });
    }
  }, [connected]);
}
