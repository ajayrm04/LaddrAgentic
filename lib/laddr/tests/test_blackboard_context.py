"""Regression tests for the shared blackboard execution context.

These cover the bug behind "No active job/database context" during a
Blackboard Run: parallel agents may share one ``ToolRegistry`` (and therefore
one blackboard tool object), so context must be resolved per async task rather
than from the tool's bound agent.
"""

from __future__ import annotations

import asyncio
import os
from types import SimpleNamespace

from laddr.core.database import DatabaseService
from laddr.core.system_tools import (
    BlackboardTool,
    reset_blackboard_context,
    set_blackboard_context,
)


def _sqlite_url(tmp_path, name: str = "blackboard.db") -> str:
    path = str(tmp_path / name).replace(os.sep, "/")
    return f"sqlite:///{path}"


def test_shared_blackboard_tool_uses_per_task_context(tmp_path):
    db = DatabaseService(_sqlite_url(tmp_path))
    db.create_tables()

    # Simulate a tool object left bound to a stale agent whose job is unset.
    stale_agent = SimpleNamespace(
        current_job_id=None,
        config=SimpleNamespace(name="stale"),
        database=db,
    )
    shared_tool = BlackboardTool(database=db, agent=stale_agent)

    async def worker(name: str):
        token = set_blackboard_context(db, f"job-{name}", name)
        try:
            return await shared_tool.write_blackboard(
                key="plan", value=f"{name} plan"
            )
        finally:
            reset_blackboard_context(token)

    async def run_both():
        return await asyncio.gather(worker("alpha"), worker("beta"))

    results = asyncio.run(run_both())
    assert results[0].get("updated_by") == "alpha"
    assert results[1].get("updated_by") == "beta"

    alpha = db.get_blackboard("job-alpha")
    beta = db.get_blackboard("job-beta")
    assert alpha["plan"]["value"] == "alpha plan"
    assert alpha["plan"]["updated_by"] == "alpha"
    assert beta["plan"]["value"] == "beta plan"
    assert beta["plan"]["updated_by"] == "beta"


def test_blackboard_tool_without_context_reports_error(tmp_path):
    db = DatabaseService(_sqlite_url(tmp_path, "noctx.db"))
    db.create_tables()

    stale_agent = SimpleNamespace(
        current_job_id=None,
        config=SimpleNamespace(name="stale"),
        database=db,
    )
    tool = BlackboardTool(database=db, agent=stale_agent)
    result = asyncio.run(tool.write_blackboard(key="plan", value="x"))
    assert "error" in result
