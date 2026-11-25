from sqlalchemy import create_engine

from laddr.core import database as database_module
from laddr.core.database import DatabaseService


def test_postgresql_backend_persists_traces(monkeypatch):
    sqlite_engine = create_engine("sqlite://")
    monkeypatch.setattr(database_module, "create_engine", lambda *args, **kwargs: sqlite_engine)

    database = DatabaseService("postgresql://user:password@localhost/laddr")
    database.append_trace("prompt-123", "researcher", "task_start", {"inputs": {"q": "x"}})

    traces = database.get_job_traces("prompt-123")
    assert database.tracing_backend_enabled
    assert len(traces) == 1
    assert traces[0]["event_type"] == "task_start"
    assert traces[0]["payload"] == {"inputs": {"q": "x"}}
