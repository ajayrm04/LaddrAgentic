"""Endpoint tests for the report API.

These set the module-level services directly (instead of relying on the
lifespan, which would connect to the deployment's real database) and exercise
the routes through FastAPI's TestClient.
"""

from __future__ import annotations

import asyncio
import uuid

import pytest
from fastapi.testclient import TestClient

import laddr.api.main as api_main
from laddr.core.config import LaddrConfig
from laddr.core.database import DatabaseService
from laddr.core.reports import ReportService


@pytest.fixture
def client(tmp_path, monkeypatch):
    db_path = tmp_path / f"reports-api-{uuid.uuid4()}.db"
    db = DatabaseService(f"sqlite:///{db_path}")
    db.create_tables()

    # Ensure auth is disabled for the test client.
    config = LaddrConfig()
    config.laddr_api_key = None

    monkeypatch.setattr(api_main, "config", config, raising=False)
    monkeypatch.setattr(api_main, "database", db, raising=False)
    monkeypatch.setattr(api_main, "storage_backend", None, raising=False)
    monkeypatch.setattr(
        api_main,
        "report_service",
        ReportService(database=db, storage=None, llm_factory=None, enabled=True),
        raising=False,
    )

    # Do not use the context manager: that would run the real lifespan.
    test_client = TestClient(api_main.app)
    test_client.db = db  # type: ignore[attr-defined]
    return test_client


def _seed_report(db: DatabaseService, prompt_id: str = "prompt-1") -> str:
    markdown = (
        "# Quantum computing explained\n\n"
        "> A short summary.\n\n"
        "## Findings\n\n1. Qubits are used. [S1]\n\n"
        "## Sources\n\n| ID | Source | URL |\n| --- | --- | --- |\n"
        "| S1 | QC | https://example.com/qc |\n"
    )
    return db.create_report(
        prompt_id=prompt_id,
        question="What is quantum computing?",
        title="Quantum computing explained",
        summary="A short summary.",
        markdown=markdown,
        sources=[
            {
                "id": "S1",
                "url": "https://example.com/qc",
                "title": "QC",
                "domain": "example.com",
                "snippet": "Qubits.",
                "retrieved_at": None,
                "tool": "web_search",
            }
        ],
        findings=[
            {"text": "Qubits are used.", "source_ids": ["S1"], "quote": "Qubits.", "verified": True}
        ],
        disagreements=["Sources differ."],
        limitations="Only one source.",
        confidence=0.7,
        methodology=[{"event": "tool_call", "agent": "researcher", "tool": "web_search"}],
        source_count=1,
        verified_count=1,
    )


def test_list_and_get_report(client):
    report_id = _seed_report(client.db)

    listing = client.get("/api/reports")
    assert listing.status_code == 200
    payload = listing.json()
    assert payload["total"] == 1
    assert payload["reports"][0]["report_id"] == report_id
    assert "markdown" not in payload["reports"][0]

    detail = client.get(f"/api/reports/{report_id}")
    assert detail.status_code == 200
    body = detail.json()
    assert body["title"] == "Quantum computing explained"
    assert body["findings"][0]["source_ids"] == ["S1"]
    assert body["markdown"]


def test_report_markdown_download(client):
    report_id = _seed_report(client.db)
    response = client.get(f"/api/reports/{report_id}/markdown")
    assert response.status_code == 200
    assert "attachment" in response.headers["content-disposition"]
    assert "# Quantum computing explained" in response.text
    assert "| S1 | QC | https://example.com/qc |" in response.text


def test_report_html_view(client):
    report_id = _seed_report(client.db)
    response = client.get(f"/api/reports/{report_id}/html")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "<html" in response.text
    assert "Quantum computing explained" in response.text


def test_share_and_public_access(client):
    report_id = _seed_report(client.db)

    share = client.post(f"/api/reports/{report_id}/share", json={"expires_in_days": 7})
    assert share.status_code == 200
    token = share.json()["token"]
    assert share.json()["path"] == f"/reports/shared/{token}"

    public = client.get(f"/api/reports/shared/{token}")
    assert public.status_code == 200
    assert public.json()["report_id"] == report_id

    public_html = client.get(f"/api/reports/shared/{token}/html")
    assert public_html.status_code == 200
    assert "<html" in public_html.text


def test_share_token_is_reused(client):
    report_id = _seed_report(client.db)
    first = client.post(f"/api/reports/{report_id}/share", json={"expires_in_days": 7}).json()["token"]
    second = client.post(f"/api/reports/{report_id}/share", json={"expires_in_days": 7}).json()["token"]
    assert first == second


def test_expired_share_returns_410(client):
    from datetime import datetime, timedelta

    report_id = _seed_report(client.db)
    client.db.set_report_share(report_id, "expired-token", datetime.utcnow() - timedelta(days=1))
    response = client.get("/api/reports/shared/expired-token")
    assert response.status_code == 410


def test_missing_report_returns_404(client):
    assert client.get("/api/reports/does-not-exist").status_code == 404
    assert client.get("/api/reports/shared/nope").status_code == 404
    assert client.get("/api/reports/does-not-exist/markdown").status_code == 404
    assert client.get("/api/reports/does-not-exist/html").status_code == 404
    assert client.post("/api/reports/does-not-exist/share", json={}).status_code == 404
    assert client.delete("/api/reports/does-not-exist").status_code == 404


def test_delete_report(client):
    report_id = _seed_report(client.db)
    response = client.delete(f"/api/reports/{report_id}")
    assert response.status_code == 200
    assert response.json()["ok"] is True
    assert client.get(f"/api/reports/{report_id}").status_code == 404


def test_filter_reports_by_prompt_and_query(client):
    first = _seed_report(client.db, prompt_id="prompt-1")
    _seed_report(client.db, prompt_id="prompt-2")

    by_prompt = client.get("/api/reports?prompt_id=prompt-1")
    assert by_prompt.status_code == 200
    assert [r["report_id"] for r in by_prompt.json()["reports"]] == [first]

    by_query = client.get("/api/reports?q=quantum")
    assert by_query.status_code == 200
    assert len(by_query.json()["reports"]) == 2

    no_match = client.get("/api/reports?q=nonexistent-term")
    assert no_match.json()["reports"] == []


def test_backfill_generates_report_for_completed_prompt(client):
    db = client.db
    prompt_id = db.create_prompt(None, "analyst", {"query": "What is quantum computing?"})
    db.save_prompt_result(
        prompt_id,
        {"status": "success", "result": "Quantum computers use qubits [S1].\n\nMore detail about the field."},
        status="completed",
    )
    db.append_trace(
        prompt_id,
        "researcher",
        "tool_result",
        {
            "tool": "web_search",
            "status": "success",
            "result": {
                "query": "quantum computing",
                "status": "success",
                "count": 1,
                "results": [
                    {
                        "title": "Quantum computing",
                        "link": "https://example.com/qc",
                        "snippet": "Qubits are the unit of quantum information.",
                    }
                ],
            },
        },
    )

    response = client.post("/api/reports/backfill", json={"prompt_ids": [prompt_id]})
    assert response.status_code == 200
    body = response.json()
    assert body["created"] == 1
    assert body["errors"] == []

    report = db.get_report_by_prompt(prompt_id)
    assert report is not None
    assert report["sources"][0]["url"] == "https://example.com/qc"

    # A second run is a no-op unless forced.
    again = client.post("/api/reports/backfill", json={"prompt_ids": [prompt_id]}).json()
    assert again["created"] == 0
    assert again["skipped"] == 1


def test_prompt_response_includes_report_id(client):
    db = client.db
    prompt_id = db.create_prompt(None, "analyst", {"query": "Q?"})
    db.save_prompt_result(prompt_id, {"status": "success", "result": "Answer."}, status="completed")
    report_id = _seed_report(db, prompt_id=prompt_id)

    response = client.get(f"/api/prompts/{prompt_id}")
    assert response.status_code == 200
    assert response.json()["report_id"] == report_id
