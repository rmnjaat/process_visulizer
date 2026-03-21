import { create } from 'zustand';
import type { ProcessInfo } from '../types/process';
import type { ThreadInfo } from '../types/thread';

interface ProcessDiff {
  new: ProcessInfo[];
  updated: Partial<ProcessInfo>[];
  exited: { pid: number }[];
}

/** Ring-buffer history entry for sparkline charts. */
export interface ProcessHistory {
  cpu: number[];
  mem: number[];
}

const HISTORY_LEN = 60; // 1 minute of sparkline data (keep lightweight)
const PINNED_STORAGE_KEY = 'pv-pinned-pids';

/** Load pinned PIDs from localStorage. */
function loadPinnedPids(): Set<number> {
  try {
    const raw = localStorage.getItem(PINNED_STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw) as number[];
      return new Set(arr);
    }
  } catch {
    // ignore corrupt data
  }
  return new Set();
}

/** Persist pinned PIDs to localStorage. */
function savePinnedPids(pids: Set<number>): void {
  try {
    localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify([...pids]));
  } catch {
    // storage full or unavailable
  }
}

interface ProcessState {
  processes: Record<number, ProcessInfo>;
  /** Per-PID history buffers (last 3 minutes). */
  history: Record<number, ProcessHistory>;
  threads: Record<number, ThreadInfo[]>;
  selectedPid: number | null;
  selectedTid: number | null;
  searchQuery: string;
  sortField: string;
  sortDirection: 'asc' | 'desc';
  /** Set of PIDs pinned to the watchlist. */
  pinnedPids: Set<number>;

  applySnapshot: (processes: ProcessInfo[]) => void;
  applyDiff: (diff: ProcessDiff) => void;
  setThreads: (pid: number, threads: ThreadInfo[]) => void;
  clearThreads: (pid: number) => void;
  setSelectedPid: (pid: number | null) => void;
  setSelectedTid: (tid: number | null) => void;
  setSearchQuery: (q: string) => void;
  setSortField: (field: string) => void;
  toggleSortDirection: () => void;
  sortedProcesses: () => ProcessInfo[];
  /** Toggle a PID's pinned status. */
  togglePin: (pid: number) => void;
  /** Check if a PID is pinned. */
  isPinned: (pid: number) => boolean;
}

export const useProcessStore = create<ProcessState>((set, get) => ({
  processes: {},
  history: {},
  threads: {},
  selectedPid: null,
  selectedTid: null,
  searchQuery: '',
  sortField: 'cpu_percent',
  sortDirection: 'desc',
  pinnedPids: loadPinnedPids(),

  applySnapshot: (processes: ProcessInfo[]) => {
    const map: Record<number, ProcessInfo> = {};
    const hist: Record<number, ProcessHistory> = {};
    for (const p of processes) {
      map[p.pid] = p;
      hist[p.pid] = { cpu: [p.cpu_percent], mem: [p.memory_rss_bytes] };
    }
    set({ processes: map, history: hist });
  },

  applyDiff: (diff: ProcessDiff) =>
    set((state) => {
      // Shallow-copy only the top-level maps (required for Zustand reactivity).
      // Individual entries are mutated in-place to avoid copying hundreds of objects.
      const processes = { ...state.processes };
      const history = { ...state.history };

      for (const p of diff.new) {
        processes[p.pid] = p;
        history[p.pid] = { cpu: [p.cpu_percent], mem: [p.memory_rss_bytes] };
      }

      for (const p of diff.updated) {
        if (p.pid !== undefined && processes[p.pid]) {
          // Mutate existing process object instead of spreading a new one
          Object.assign(processes[p.pid], p);
          const prev = history[p.pid];
          if (prev) {
            // Push in-place, shift if over limit — avoids slice/spread allocations
            prev.cpu.push(processes[p.pid].cpu_percent);
            if (prev.cpu.length > HISTORY_LEN) prev.cpu.shift();
            prev.mem.push(processes[p.pid].memory_rss_bytes);
            if (prev.mem.length > HISTORY_LEN) prev.mem.shift();
          } else {
            history[p.pid] = { cpu: [processes[p.pid].cpu_percent], mem: [processes[p.pid].memory_rss_bytes] };
          }
        }
      }

      for (const e of diff.exited) {
        delete processes[e.pid];
        delete history[e.pid];
      }

      return { processes, history };
    }),

  setThreads: (pid: number, threads: ThreadInfo[]) =>
    set((state) => ({
      threads: { ...state.threads, [pid]: threads },
    })),

  clearThreads: (pid: number) =>
    set((state) => {
      const threads = { ...state.threads };
      delete threads[pid];
      return { threads };
    }),

  setSelectedPid: (pid: number | null) => set({ selectedPid: pid }),
  setSelectedTid: (tid: number | null) => set({ selectedTid: tid }),
  setSearchQuery: (q: string) => set({ searchQuery: q }),
  setSortField: (field: string) => set({ sortField: field }),
  toggleSortDirection: () =>
    set((state) => ({
      sortDirection: state.sortDirection === 'asc' ? 'desc' : 'asc',
    })),

  togglePin: (pid: number) =>
    set((state) => {
      const next = new Set(state.pinnedPids);
      if (next.has(pid)) {
        next.delete(pid);
      } else {
        next.add(pid);
      }
      savePinnedPids(next);
      return { pinnedPids: next };
    }),

  isPinned: (pid: number) => get().pinnedPids.has(pid),

  sortedProcesses: () => {
    const state = get();
    let list = Object.values(state.processes);

    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.cmdline.toLowerCase().includes(q) ||
          p.username.toLowerCase().includes(q) ||
          String(p.pid).includes(q)
      );
    }

    list.sort((a, b) => {
      const field = state.sortField as keyof ProcessInfo;
      const aVal = a[field] ?? 0;
      const bVal = b[field] ?? 0;
      if (aVal < bVal) return state.sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return state.sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    // Pinned processes float to the top, preserving sort order within each group
    const pinned = list.filter((p) => state.pinnedPids.has(p.pid));
    const unpinned = list.filter((p) => !state.pinnedPids.has(p.pid));
    return [...pinned, ...unpinned];
  },
}));
