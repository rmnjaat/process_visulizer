import { useEffect, useRef } from 'react';
import { getSharedSendMessage } from './useWebSocket';

export function useProcessSubscription(pid: number | null) {
  const sendMessage = getSharedSendMessage();
  const prevPidRef = useRef<number | null>(null);

  useEffect(() => {
    if (prevPidRef.current !== null) {
      sendMessage({ action: 'unsubscribe_process', pid: prevPidRef.current });
    }

    if (pid !== null) {
      sendMessage({ action: 'subscribe_process', pid });
    }

    prevPidRef.current = pid;

    return () => {
      if (prevPidRef.current !== null) {
        sendMessage({ action: 'unsubscribe_process', pid: prevPidRef.current });
        prevPidRef.current = null;
      }
    };
  }, [pid, sendMessage]);
}
