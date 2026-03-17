import { create } from 'zustand';
import type { ProcessInfo } from '../types/process';
import type { ThreadInfo } from '../types/thread';

interface ProcessDiff {
  new: ProcessInfo[];
  updated: Partial<ProcessInfo>[];
  exited: { pid: number }[];
}

interface ProcessState {
  processes: Record<number, ProcessInfo>;
  threads: Record<number, ThreadInfo[]>;
  selectedPid: number | null;
  selectedTid: number | null;
  searchQuery: string;
  sortField: string;
  sortDirection: 'asc' | 'desc';

  applySnapshot: (processes: ProcessInfo[]) => void;
  applyDiff: (diff: ProcessDiff) => void;
  setThreads: (pid: number, threads: ThreadInfo[]) => void;
  setSelectedPid: (pid: number | null) => void;
  setSelectedTid: (tid: number | null) => void;
  setSearchQuery: (q: string) => void;
  setSortField: (field: string) => void;
  toggleSortDirection: () => void;
  sortedProcesses: () => ProcessInfo[];
}

export const useProcessStore = create<ProcessState>((set, get) => ({
  processes: {},
  threads: {},
  selectedPid: null,
  selectedTid: null,
  searchQuery: '',
  sortField: 'cpu_percent',
  sortDirection: 'desc',

  applySnapshot: (processes: ProcessInfo[]) => {
    const map: Record<number, ProcessInfo> = {};
    for (const p of processes) {
      map[p.pid] = p;
    }
    set({ processes: map });
  },

  applyDiff: (diff: ProcessDiff) =>
    set((state) => {
      const processes = { ...state.processes };

      for (const p of diff.new) {
        processes[p.pid] = p;
      }

      for (const p of diff.updated) {
        if (p.pid !== undefined && processes[p.pid]) {
          processes[p.pid] = { ...processes[p.pid], ...p };
        }
      }

      for (const e of diff.exited) {
        delete processes[e.pid];
      }

      return { processes };
    }),

  setThreads: (pid: number, threads: ThreadInfo[]) =>
    set((state) => ({
      threads: { ...state.threads, [pid]: threads },
    })),

  setSelectedPid: (pid: number | null) => set({ selectedPid: pid }),
  setSelectedTid: (tid: number | null) => set({ selectedTid: tid }),
  setSearchQuery: (q: string) => set({ searchQuery: q }),
  setSortField: (field: string) => set({ sortField: field }),
  toggleSortDirection: () =>
    set((state) => ({
      sortDirection: state.sortDirection === 'asc' ? 'desc' : 'asc',
    })),

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

    return list;
  },
}));
