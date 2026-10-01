import threading
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

class WALRecord(BaseModel):
    lsn: int = Field(..., description="Monotonically increasing Log Sequence Number")
    op_type: str = Field(..., description="Operation type: INSERT, UPDATE, DELETE")
    record_key: str = Field(..., description="Target record key")
    payload: Dict[str, Any] = Field(default_factory=dict, description="Record fields and value")
    source_primary: str = Field(..., description="ID of the primary node that authored this write")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class WALManager:
    """
    Manages the cluster's Write-Ahead Log (WAL).
    In real databases (like PostgreSQL), WAL is flushed to disk before transaction commit.
    Here it provides an auditable, ordered stream of state transitions that replicas replay.
    """
    def __init__(self, initial_lsn: int = 0):
        self._current_lsn: int = initial_lsn
        self._records: List[WALRecord] = []
        self._lock = threading.Lock()

    @property
    def current_lsn(self) -> int:
        with self._lock:
            return self._current_lsn

    def append_record(
        self,
        op_type: str,
        record_key: str,
        payload: Dict[str, Any],
        primary_id: str
    ) -> WALRecord:
        """
        Atomically increments LSN and appends a new transaction WAL record.
        """
        with self._lock:
            self._current_lsn += 1
            record = WALRecord(
                lsn=self._current_lsn,
                op_type=op_type,
                record_key=record_key,
                payload=payload,
                source_primary=primary_id,
                created_at=datetime.now(timezone.utc)
            )
            self._records.append(record)
            return record

    def get_records_since(self, last_lsn: int) -> List[WALRecord]:
        """
        Retrieves all WAL records with LSN > last_lsn in strict chronological order.
        Replicas use this to discover missing changes.
        """
        with self._lock:
            return [rec for rec in self._records if rec.lsn > last_lsn]

    def get_record(self, lsn: int) -> Optional[WALRecord]:
        with self._lock:
            for rec in self._records:
                if rec.lsn == lsn:
                    return rec
            return None

    def clear(self):
        with self._lock:
            self._records.clear()
            self._current_lsn = 0
