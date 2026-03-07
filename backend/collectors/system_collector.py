from __future__ import annotations

import os
import platform
import re
import subprocess
import time

import psutil

from backend.models.system import CpuSnapshot, MemorySnapshot, SystemSnapshot


def _macos_vm_stat() -> dict[str, int]:
    """Parse macOS vm_stat output to get wired, compressed, etc. in bytes."""
    result: dict[str, int] = {}
    try:
        raw = subprocess.check_output(["vm_stat"], text=True)
        # First line: "Mach Virtual Memory Statistics: (page size of 16384 bytes)"
        page_match = re.search(r"page size of (\d+) bytes", raw)
        page_size = int(page_match.group(1)) if page_match else 16384

        mapping = {
            "Pages wired down": "wired",
            "Pages occupied by compressor": "compressed",
            "Pages active": "active",
            "Pages inactive": "inactive",
            "Pages free": "free",
            "Pages purgeable": "purgeable",
        }
        for line in raw.splitlines():
            for key, name in mapping.items():
                if line.startswith(key):
                    val = int(line.split(":")[1].strip().rstrip("."))
                    result[name] = val * page_size
                    break
    except Exception:
        pass
    return result


class SystemCollector:
    """Collects system-level metrics using psutil."""

    def __init__(self) -> None:
        # Prime the CPU percent baseline so the first real call returns
        # meaningful values instead of 0.0.
        psutil.cpu_percent(percpu=True)

    def collect(self) -> SystemSnapshot:
        """Take a full system snapshot."""
        # --- CPU ---
        usage_per_core = psutil.cpu_percent(percpu=True)
        total_usage = psutil.cpu_percent(percpu=False)
        freq = psutil.cpu_freq()
        frequency_mhz = freq.current if freq else 0.0
        frequency_min_mhz = freq.min if freq else 0.0
        frequency_max_mhz = freq.max if freq else 0.0

        cpu = CpuSnapshot(
            model_=platform.processor() or "unknown",
            physical_cores=psutil.cpu_count(logical=False) or 1,
            logical_cores=psutil.cpu_count(logical=True) or 1,
            frequency_mhz=frequency_mhz,
            frequency_min_mhz=frequency_min_mhz,
            frequency_max_mhz=frequency_max_mhz,
            usage_per_core=usage_per_core,
            total_usage=total_usage,
        )

        # --- Memory ---
        vm = psutil.virtual_memory()
        swap = psutil.swap_memory()

        # On macOS, psutil's vm.used = active + wired (excludes compressed),
        # so total != used + available + free.  Use total - available instead,
        # which matches Activity Monitor's "Memory Used".
        is_macos = platform.system() == "Darwin"

        wired = 0
        compressed = 0
        app_memory = 0
        inactive = 0
        purgeable = 0

        if is_macos:
            vms = _macos_vm_stat()
            wired = vms.get("wired", 0)
            compressed = vms.get("compressed", 0)
            active = vms.get("active", 0)
            inactive = vms.get("inactive", 0)
            purgeable = vms.get("purgeable", 0)
            # Activity Monitor: App Memory = used - wired - compressed
            # where used = total - available
            used_bytes = vm.total - vm.available
            app_memory = max(0, used_bytes - wired - compressed)
        else:
            used_bytes = vm.used

        memory = MemorySnapshot(
            total_bytes=vm.total,
            available_bytes=vm.available,
            used_bytes=used_bytes,
            free_bytes=vm.free,
            percent=vm.percent,
            cached_bytes=getattr(vm, "cached", 0),
            buffers_bytes=getattr(vm, "buffers", 0),
            shared_bytes=getattr(vm, "shared", 0),
            wired_bytes=wired,
            compressed_bytes=compressed,
            app_memory_bytes=app_memory,
            inactive_bytes=inactive,
            purgeable_bytes=purgeable,
            swap_total_bytes=swap.total,
            swap_used_bytes=swap.used,
            swap_free_bytes=swap.free,
            swap_percent=swap.percent,
        )

        # --- System info ---
        uptime_seconds = int(time.time() - psutil.boot_time())
        load_avg = list(os.getloadavg())

        return SystemSnapshot(
            hostname=platform.node(),
            os=f"{platform.system()} {platform.release()}",
            uptime_seconds=uptime_seconds,
            cpu=cpu,
            memory=memory,
            load_average=load_avg,
        )
