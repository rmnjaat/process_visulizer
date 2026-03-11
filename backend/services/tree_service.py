from __future__ import annotations

from collections import defaultdict

from backend.models.process import ProcessSnapshot
from backend.models.thread import ThreadSnapshot


class TreeService:
    """Builds a hierarchical process/thread tree from flat snapshot lists."""

    def build_tree(
        self,
        processes: list[ProcessSnapshot],
        threads_by_pid: dict[int, list[ThreadSnapshot]] | None = None,
    ) -> list[dict]:
        """Return a list of root tree nodes.

        Each node has the shape::

            {
                "entity_type": "process" | "thread",
                "data": <model_dump>,
                "children": [<child nodes>],
            }

        Roots are processes whose ppid is 0 or whose ppid does not appear
        in the current process list.
        """
        if threads_by_pid is None:
            threads_by_pid = {}

        pid_set = {p.pid for p in processes}
        proc_map: dict[int, ProcessSnapshot] = {p.pid: p for p in processes}

        # Group processes by their parent PID.
        children_map: dict[int, list[ProcessSnapshot]] = defaultdict(list)
        for proc in processes:
            children_map[proc.ppid].append(proc)

        # Identify root processes.
        roots = [p for p in processes if p.ppid == 0 or p.ppid not in pid_set]

        visited: set[int] = set()

        def build_node(proc: ProcessSnapshot) -> dict:
            visited.add(proc.pid)
            child_nodes: list[dict] = []

            # Recurse into child processes (skip already-visited to prevent cycles).
            for child_proc in children_map.get(proc.pid, []):
                if child_proc.pid not in visited:
                    child_nodes.append(build_node(child_proc))

            # Attach threads for this PID.
            for thread in threads_by_pid.get(proc.pid, []):
                child_nodes.append(
                    {
                        "entity_type": "thread",
                        "data": thread.model_dump(),
                        "children": [],
                    }
                )

            return {
                "entity_type": "process",
                "data": proc.model_dump(),
                "children": child_nodes,
            }

        result: list[dict] = []
        for root in roots:
            if root.pid not in visited:
                result.append(build_node(root))
        return result
