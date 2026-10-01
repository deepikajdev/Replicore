from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

class RecordWriteRequest(BaseModel):
    key: str = Field(..., min_length=1, max_length=255, description="Unique key for data record")
    value: str = Field(..., description="Payload content or JSON string")
    target_node_id: Optional[str] = Field(None, description="Optional target node ID (e.g. primary, replica-1) for direct write or split-brain fencing verification")

class RecordResponse(BaseModel):
    id: Optional[int] = None
    key: str
    value: str
    version: int = 1
    node_id: str
    node_role: str
    lsn: Optional[int] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class NodeDataSummary(BaseModel):
    node_id: str
    role: str
    total_records: int
    last_lsn: int
    data_checksum: str
    status: str

class ConsistencyReport(BaseModel):
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_consistent: bool
    primary_checksum: str
    nodes_summary: List[NodeDataSummary]
    divergent_keys: List[str] = Field(default_factory=list)
    replication_lags: Dict[str, int] = Field(default_factory=dict)
