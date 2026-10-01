import pytest
import os
import shutil
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.core.cluster_manager import ClusterManager
from backend.app.config import settings

@pytest.fixture(scope="session", autouse=True)
def cleanup_test_data():
    """Ensures test database directory is cleaned up after testing."""
    yield
    test_data_dir = "./data"
    if os.path.exists(test_data_dir):
        shutil.rmtree(test_data_dir, ignore_errors=True)

@pytest.fixture
def client(tmp_path):
    """FastAPI TestClient fixture with clean cluster state per test."""
    test_db_dir = tmp_path / "client_cluster_data"
    test_db_dir.mkdir(parents=True, exist_ok=True)
    from backend.app.core.cluster_manager import cluster
    cluster.base_data_dir = str(test_db_dir)
    cluster.current_epoch = 1
    cluster._failover_in_progress = False
    cluster.audit_events.clear()
    cluster.wal_manager.clear()
    cluster._init_cluster()
    with TestClient(app) as test_client:
        yield test_client

@pytest.fixture
def fresh_cluster(tmp_path):
    """Provides an isolated ClusterManager instance with separate database files per test."""
    test_db_dir = tmp_path / "test_cluster_data"
    test_db_dir.mkdir(parents=True, exist_ok=True)
    return ClusterManager(base_data_dir=str(test_db_dir))
