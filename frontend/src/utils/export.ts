import type { ProcessInfo } from '../types/process';
import type { SystemInfo } from '../types/system';

/**
 * Build a timestamp string for filenames: YYYY-MM-DD_HHmmss
 */
function fileTimestamp(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const time = now.toTimeString().slice(0, 8).replace(/:/g, ''); // HHmmss
  return `${date}_${time}`;
}

/**
 * Trigger a browser download for the given content.
 */
function downloadFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * CSV-safe value: wraps in quotes if the value contains commas, quotes, or newlines.
 */
function csvEscape(value: unknown): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Export an array of ProcessInfo objects as a CSV file download.
 */
export function exportProcessesCSV(processes: ProcessInfo[]): void {
  if (processes.length === 0) return;

  const fields: (keyof ProcessInfo)[] = [
    'pid',
    'ppid',
    'name',
    'exe',
    'cmdline',
    'status',
    'username',
    'create_time',
    'cpu_percent',
    'cpu_time_user',
    'cpu_time_system',
    'cpu_time_children_user',
    'cpu_time_children_system',
    'cpu_time_iowait',
    'memory_rss_bytes',
    'memory_vms_bytes',
    'memory_shared_bytes',
    'memory_text_bytes',
    'memory_data_bytes',
    'memory_lib_bytes',
    'memory_dirty_bytes',
    'memory_percent',
    'memory_uss_bytes',
    'memory_pss_bytes',
    'num_threads',
    'nice',
    'io_read_count',
    'io_write_count',
    'io_read_bytes',
    'io_write_bytes',
    'ctx_switches_voluntary',
    'ctx_switches_involuntary',
    'num_fds',
    'num_connections',
    'num_open_files',
  ];

  const header = fields.join(',');
  const rows = processes.map((p) => fields.map((f) => csvEscape(p[f])).join(','));
  const csv = [header, ...rows].join('\n');

  downloadFile(`processes_${fileTimestamp()}.csv`, csv, 'text/csv;charset=utf-8');
}

/**
 * Export an array of ProcessInfo objects as a formatted JSON file download.
 */
export function exportProcessesJSON(processes: ProcessInfo[]): void {
  const payload = {
    exported_at: new Date().toISOString(),
    count: processes.length,
    processes,
  };
  const json = JSON.stringify(payload, null, 2);
  downloadFile(`processes_${fileTimestamp()}.json`, json, 'application/json');
}

/**
 * Export the current system snapshot and history as a JSON file download.
 */
export function exportSystemJSON(system: SystemInfo | null, history: SystemInfo[]): void {
  const payload = {
    exported_at: new Date().toISOString(),
    current: system,
    history_length: history.length,
    history,
  };
  const json = JSON.stringify(payload, null, 2);
  downloadFile(`system_${fileTimestamp()}.json`, json, 'application/json');
}
