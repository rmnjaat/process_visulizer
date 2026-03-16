export interface ThreadInfo {
  entity_type: 'thread';
  tid: number;
  pid: number;
  name: string;
  state: string;
  cpu_time_user: number;
  cpu_time_system: number;
  cpu_percent: number;
  priority: number;
  nice: number;
  core_id: number | null;
  voluntary_ctx_switches: number;
  involuntary_ctx_switches: number;
  stack_size_bytes: number;
}
