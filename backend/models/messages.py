from __future__ import annotations

from pydantic import BaseModel

from backend.models.process import ProcessSnapshot


class ProcessDiff(BaseModel):
    new: list[ProcessSnapshot]
    updated: list[dict]
    exited: list[dict]
