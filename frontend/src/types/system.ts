export interface CpuInfo {
  model: string;
  physical_cores: number;
  logical_cores: number;
  frequency_mhz: number;
  frequency_min_mhz: number;
  frequency_max_mhz: number;
  usage_per_core: number[];
  total_usage: number;
}

export interface MemoryInfo {
  total_bytes: number;
  available_bytes: number;
  used_bytes: number;
  free_bytes: number;
  percent: number;
  cached_bytes: number;
  buffers_bytes: number;
  shared_bytes: number;
  // macOS-specific breakdown (mirrors Activity Monitor)
  wired_bytes: number;
  compressed_bytes: number;
  app_memory_bytes: number;
  inactive_bytes: number;
  purgeable_bytes: number;
  swap_total_bytes: number;
  swap_used_bytes: number;
  swap_free_bytes: number;
  swap_percent: number;
}

export interface SystemInfo {
  hostname: string;
  os: string;
  uptime_seconds: number;
  cpu: CpuInfo;
  memory: MemoryInfo;
  load_average: number[];
}
