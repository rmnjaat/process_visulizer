import { useEffect, useRef } from 'react';
import { useSystemStore } from '../stores/systemStore';
import { useProcessStore } from '../stores/processStore';
import { useToastStore } from '../stores/toastStore';

// Module-level WebSocket so only one connection exists across the app.
let _ws: WebSocket | null = null;
let _hasReceivedSnapshot = false;
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let _reconnectDelay = 1000;
let _intentionallyClosed = false;

function getWsUrl(): string {
  // Use the page origin for the WS so Vite proxy works in dev,
  // and direct connection works in production.
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

function handleMessage(event: MessageEvent) {
  try {
    const msg = JSON.parse(event.data);
    const { setSystem } = useSystemStore.getState();
    const { applySnapshot, applyDiff, setThreads } = useProcessStore.getState();

    if (msg.type === 'snapshot') {
      if (msg.system) setSystem(msg.system);
      if (msg.processes) applySnapshot(msg.processes);
      _hasReceivedSnapshot = true;
    } else if (msg.type === 'diff') {
      if (msg.system) setSystem(msg.system);
      if (msg.diff) {
        // Show toasts only for diffs after the initial snapshot
        if (_hasReceivedSnapshot) {
          const { addToast } = useToastStore.getState();
          const diff = msg.diff;
          if (diff.new) {
            for (const p of diff.new) {
              addToast(`Process started: ${p.name} (PID ${p.pid})`, 'success');
            }
          }
          if (diff.exited) {
            const processes = useProcessStore.getState().processes;
            for (const e of diff.exited) {
              const proc = processes[e.pid];
              const name = proc ? proc.name : 'unknown';
              addToast(`Process exited: ${name} (PID ${e.pid})`, 'warning');
            }
          }
        }
        applyDiff(msg.diff);
      }
    }

    // Handle threads for both message types
    if (msg.threads) {
      for (const [pidStr, threadList] of Object.entries(msg.threads)) {
        setThreads(Number(pidStr), threadList as any[]);
      }
    }
  } catch {
    // ignore malformed messages
  }
}

function connectWs() {
  if (_ws?.readyState === WebSocket.OPEN || _ws?.readyState === WebSocket.CONNECTING) {
    return;
  }

  _intentionallyClosed = false;
  const wsUrl = getWsUrl();
  const ws = new WebSocket(wsUrl);
  _ws = ws;

  ws.onopen = () => {
    useSystemStore.getState().setConnected(true);
    _reconnectDelay = 1000;
  };

  ws.onclose = () => {
    useSystemStore.getState().setConnected(false);
    _ws = null;
    if (!_intentionallyClosed) {
      _reconnectTimer = setTimeout(() => {
        _reconnectDelay = Math.min(_reconnectDelay * 2, 10000);
        connectWs();
      }, _reconnectDelay);
    }
  };

  ws.onerror = () => {
    // onclose will fire after this
  };

  ws.onmessage = handleMessage;
}

export function disconnectWs() {
  _intentionallyClosed = true;
  if (_reconnectTimer) {
    clearTimeout(_reconnectTimer);
    _reconnectTimer = null;
  }
  if (_ws) {
    _ws.close();
    _ws = null;
  }
  useSystemStore.getState().setConnected(false);
}

export function getSharedSendMessage() {
  return sendWsMessage;
}

export function sendWsMessage(msg: object) {
  if (_ws?.readyState === WebSocket.OPEN) {
    _ws.send(JSON.stringify(msg));
  }
}

/**
 * Call once at the App level. Connects on mount, disconnects on unmount.
 */
export function useWebSocket() {
  const connected = useSystemStore((s) => s.connected);
  const didConnect = useRef(false);

  useEffect(() => {
    if (!didConnect.current) {
      didConnect.current = true;
      connectWs();
    }
    return () => {
      // Only disconnect if truly unmounting (not StrictMode double-invoke)
      // StrictMode runs effects, cleanups, then effects again.
      // We use a timeout so the second mount can cancel the disconnect.
    };
  }, []);

  return { sendMessage: sendWsMessage, connected };
}
