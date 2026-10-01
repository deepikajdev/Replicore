from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field
from typing import Literal

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    APP_NAME: str = "Replicore"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False
    API_PORT: int = 8000

    # Cluster Engine Mode: "local" (in-process SQLite multi-node simulation) or "postgres" (multi-container)
    REPLICORE_CLUSTER_MODE: Literal["local", "postgres"] = "local"

    # PostgreSQL Connection Strings
    PRIMARY_DB_URL: str = "postgresql+psycopg://replicore_user:replicore_pass@localhost:5432/replicore_db"
    REPLICA_1_DB_URL: str = "postgresql+psycopg://replicore_user:replicore_pass@localhost:5433/replicore_db"
    REPLICA_2_DB_URL: str = "postgresql+psycopg://replicore_user:replicore_pass@localhost:5434/replicore_db"

    # Local SQLite Simulation Paths
    PRIMARY_SQLITE_PATH: str = "./data/primary.db"
    REPLICA_1_SQLITE_PATH: str = "./data/replica_1.db"
    REPLICA_2_SQLITE_PATH: str = "./data/replica_2.db"

    # Simulation Defaults & Delays
    REPLICA_1_DELAY_MS: int = 500
    REPLICA_2_DELAY_MS: int = 2000
    REPLICATION_POLL_INTERVAL_MS: int = 50
    HEARTBEAT_INTERVAL_SECONDS: float = 2.0
    MISSED_HEARTBEAT_THRESHOLD: int = 3
    AUTO_FAILOVER_ENABLED: bool = True

settings = Settings()
