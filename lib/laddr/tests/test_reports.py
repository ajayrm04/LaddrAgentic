"""Tests for cited report compilation, persistence, and rendering."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta
import json
import uuid

import pytest

from laddr.core.database import DatabaseService
from laddr.core.reports import (
    ReportDraft,
    ReportFinding,
    ReportService,
    ReportSource,
    coerce_answer,
    deterministic_draft,
    extract_question,
    extract_sources,
    normalize_url,
    parse_json_loose,
    render_html,
    render_markdown,
    validate_draft,
)


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------


@pytest.fixture
def db(tmp_path):
    db_path = tmp_path / f"reports-{uuid.uuid4()}.db"
    return DatabaseService(f"sqlite:///{db_path}")


def _web_search_trace(
    *,
    trace_id: int = 1,
    results: list[dict] | None = None,
    status: str = "success",
) -> dict:
    return {
        "id": trace_id,
        "job_id": "prompt-1",
        "agent_name": "researcher",
        "event_type": "tool_result",
        "parent_id": None,
        "payload": {
            "tool": "web_search",
            "status": status,
            "duration_ms": 420,
            "result": {
                "query": "quantum computing",
                "status": status,
                "count": len(results or []),
                "results": results or [],
            },
        },
        "timestamp": "2026-01-01T00:00:00Z",
    }


SEARCH_RESULTS = [
    {
        "title": "Quantum computing - Wikipedia",
        "link": "https://en.wikipedia.org/wiki/Quantum_computing?utm_source=x",
        "snippet": "Quantum computing is a type of computation that harnesses quantum mechanics.",
        "site": "en.wikipedia.org",
        "type": "organic",
    },
    {
        "title": "What is quantum computing? | IBM",
        "link": "https://www.ibm.com/think/topics/quantum-computing",
        "snippet": "Quantum computers use qubits which can represent 0, 1, or both simultaneously.",
        "site": "ibm.com",
        "type": "organic",
    },
    {
        "title": "Quantum computing duplicate",
        "link": "http://en.wikipedia.org/wiki/Quantum_computing#History",
        "snippet": "",
        "site": "en.wikipedia.org",
        "type": "organic",
    },
]


class FakeLLM:
    def __init__(self, response):
        self.response = response
        self.calls: list[dict] = []

    async def generate(self, prompt, system=None, **kwargs):
        self.calls.append({"prompt": prompt, "system": system})
        if isinstance(self.response, Exception):
            raise self.response
        return self.response


class FakeFactory:
    def __init__(self, llm):
        self.llm = llm

    def create_llm_backend(self, override=None, model_override=None, agent_name=None):
        return self.llm


class BrokenFactory:
    def create_llm_backend(self, override=None, model_override=None, agent_name=None):
        raise RuntimeError("no llm configured")


# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------


def test_normalize_url_strips_tracking_and_fragment():
    a = normalize_url("https://www.Example.com/path/?utm_source=x&id=7#frag")
    b = normalize_url("http://example.com/path?id=7")
    assert a == b == "https://example.com/path?id=7"


def test_extract_question_prefers_known_keys():
    assert extract_question({"query": "  what is x?  "}) == "what is x?"
    assert extract_question({"prompt": "hi"}) == "hi"
    assert extract_question("plain string") == "plain string"
    assert extract_question(None) == ""


@pytest.mark.parametrize(
    "value,expected",
    [
        ("plain answer", "plain answer"),
        (json.dumps({"result": "nested answer"}), "nested answer"),
        ({"status": "success", "result": "direct answer"}, "direct answer"),
        ({"error": "boom"}, ""),
        (None, ""),
        (
            {
                "results": [
                    {"agent": "researcher", "result": "first"},
                    {"agent": "coordinator", "result": "final answer"},
                ]
            },
            "final answer",
        ),
    ],
)
def test_coerce_answer(value, expected):
    assert coerce_answer(value) == expected


def test_extract_sources_from_web_search_dedupes():
    sources = extract_sources([_web_search_trace(results=SEARCH_RESULTS)], answer_text="")
    # Three results, but two normalize to the same Wikipedia URL.
    assert [s.id for s in sources] == ["S1", "S2"]
    assert sources[0].domain == "en.wikipedia.org"
    assert sources[0].url == "https://en.wikipedia.org/wiki/Quantum_computing?utm_source=x"
    assert "quantum mechanics" in (sources[0].snippet or "")


def test_extract_sources_ignores_error_results():
    trace = _web_search_trace(results=[], status="error")
    assert extract_sources([trace]) == []


def test_extract_sources_falls_back_to_urls_in_answer():
    sources = extract_sources([], answer_text="See https://example.org/study for details.")
    assert len(sources) == 1
    assert sources[0].url == "https://example.org/study"
    assert sources[0].id == "S1"


def test_extract_sources_from_scrape_url():
    trace = {
        "id": 2,
        "event_type": "tool_result",
        "payload": {
            "tool": "scrape_url",
            "status": "success",
            "result": {
                "url": "https://arxiv.org/abs/1234",
                "title": "A Paper",
                "text": "Abstract text here.",
            },
        },
        "timestamp": "2026-01-01T00:00:01Z",
    }
    sources = extract_sources([trace])
    assert len(sources) == 1
    assert sources[0].title == "A Paper"
    assert sources[0].tool == "scrape_url"


def test_extract_sources_handles_string_payload():
    trace = _web_search_trace(results=SEARCH_RESULTS[:1])
    trace["payload"] = json.dumps(trace["payload"])
    sources = extract_sources([trace])
    assert len(sources) == 1


# ---------------------------------------------------------------------------
# Deterministic compiler
# ---------------------------------------------------------------------------


def test_deterministic_draft_extracts_findings_and_citations():
    sources = extract_sources([_web_search_trace(results=SEARCH_RESULTS)])
    answer = (
        "Quantum computers use qubits [S2].\n\n"
        "Quantum mechanics underpins the field [S1].\n\n"
        "A claim with no citation at all here."
    )
    draft = deterministic_draft("What is quantum computing?", answer, sources)

    assert draft.title
    assert draft.summary
    assert len(draft.findings) == 3
    assert draft.findings[0].source_ids == ["S2"]
    assert draft.findings[1].source_ids == ["S1"]
    assert draft.findings[2].source_ids == []
    assert draft.findings[0].verified is True
    assert 0.0 < draft.confidence <= 0.85


def test_deterministic_draft_without_sources_has_low_confidence():
    draft = deterministic_draft("Q?", "Some answer with enough characters to count.", [])
    assert draft.findings
    assert all(not f.verified for f in draft.findings)
    assert draft.confidence <= 0.4


# ---------------------------------------------------------------------------
# LLM parsing + validation
# ---------------------------------------------------------------------------


def test_parse_json_loose_handles_fences_and_prose():
    fenced = '```json\n{"a": 1}\n```'
    assert parse_json_loose(fenced) == {"a": 1}
    prose = 'Sure! Here is the report:\n{"a": 2}\nHope that helps.'
    assert parse_json_loose(prose) == {"a": 2}
    assert parse_json_loose("not json") is None


def test_validate_draft_drops_unknown_ids_and_dedupes():
    sources = [ReportSource(id="S1", url="https://a.com", title="A", domain="a.com")]
    draft = ReportDraft(
        title="T",
        summary="S",
        findings=[
            ReportFinding(text="Claim one", source_ids=["S1", "S9", "1"], quote="a" * 20),
            ReportFinding(text="claim ONE", source_ids=["S1"]),
            ReportFinding(text="", source_ids=["S1"]),
        ],
        confidence=0.99,
    )
    result = validate_draft(draft, sources)
    assert len(result.findings) == 1
    assert result.findings[0].source_ids == ["S1"]
    assert result.findings[0].verified is True
    assert result.confidence <= 1.0


def test_validate_draft_caps_confidence_when_unverified():
    sources = [ReportSource(id="S1", url="https://a.com", title="A", domain="a.com")]
    draft = ReportDraft(
        title="T",
        summary="S",
        findings=[ReportFinding(text="Unbacked claim", source_ids=[])],
        confidence=1.0,
    )
    result = validate_draft(draft, sources)
    assert result.confidence <= 0.5


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------


def _sample_draft() -> ReportDraft:
    sources = [
        ReportSource(
            id="S1",
            url="https://a.com/x",
            title="Source A",
            domain="a.com",
            snippet="A snippet.",
        )
    ]
    return ReportDraft(
        title="My Report",
        summary="A short summary.",
        findings=[
            ReportFinding(text="Finding one", source_ids=["S1"], quote="A snippet.", verified=True),
            ReportFinding(text="Finding two", source_ids=[], quote=None, verified=False),
        ],
        disagreements=["Sources disagree."],
        limitations="Only one source.",
        confidence=0.6,
        sources=sources,
    )


def test_render_markdown_contains_sections_and_table():
    md = render_markdown(_sample_draft(), "What?", "2026-01-01 00:00 UTC")
    assert "# My Report" in md
    assert "## Findings" in md
    assert "## Disagreements" in md
    assert "## Limitations" in md
    assert "## Sources" in md
    assert "[S1]" in md
    assert "| S1 | Source A | https://a.com/x |" in md
    assert "unverified" in md


def test_render_html_escapes_and_links_citations():
    draft = _sample_draft()
    draft.title = "Report <script>alert(1)</script>"
    draft.findings[0].text = "Finding with <b>tags</b>"
    html = render_html(draft, "What?", "2026-01-01")
    assert "<script>alert(1)</script>" not in html
    assert "&lt;script&gt;" in html
    assert 'href="#source-S1"' in html
    assert 'id="source-S1"' in html


# ---------------------------------------------------------------------------
# Database persistence
# ---------------------------------------------------------------------------


def test_report_database_roundtrip(db):
    report_id = db.create_report(
        prompt_id="p1",
        question="What?",
        title="T",
        summary="S",
        sources=[{"id": "S1"}],
        findings=[{"text": "F", "source_ids": ["S1"], "verified": True}],
        confidence=0.5,
        source_count=1,
        verified_count=1,
    )
    fetched = db.get_report(report_id)
    assert fetched["title"] == "T"
    assert fetched["findings"][0]["text"] == "F"
    assert db.get_report_by_prompt("p1")["report_id"] == report_id
    assert len(db.list_reports()) == 1
    assert db.count_reports() == 1

    token = "tok-123"
    assert db.set_report_share(report_id, token, datetime.utcnow() + timedelta(days=1))
    shared = db.get_report_by_share_token(token)
    assert shared["report_id"] == report_id

    assert db.delete_report(report_id)
    assert db.get_report(report_id) is None


def test_list_reports_filters_and_search(db):
    db.create_report(prompt_id="p1", question="alpha", title="First")
    db.create_report(prompt_id="p2", question="beta", title="Second")
    assert len(db.list_reports(query="alpha")) == 1
    assert len(db.list_reports(prompt_id="p2")) == 1
    assert len(db.list_reports(status="complete")) == 2


# ---------------------------------------------------------------------------
# ReportService
# ---------------------------------------------------------------------------


def _service(db, llm=None):
    return ReportService(
        database=db,
        storage=None,
        llm_factory=FakeFactory(llm) if llm is not None else None,
        enabled=True,
    )


def test_compile_uses_deterministic_fallback_without_llm(db):
    service = _service(db)
    traces = [_web_search_trace(results=SEARCH_RESULTS)]
    answer = {"status": "success", "result": "Quantum computers use qubits [S2].\n\nMore detail about the field."}

    report = asyncio.run(
        service.compile_for_prompt(
            prompt_id="p1",
            question="What is quantum computing?",
            answer=answer,
            traces=traces,
            agent_name="researcher",
        )
    )

    assert report is not None
    assert report["report_id"]
    assert report["sources"][0]["id"] == "S1"
    assert report["findings"]
    assert report["markdown"]
    assert report["html_key"] is None  # no storage configured


def test_compile_is_idempotent(db):
    service = _service(db)
    kwargs = dict(
        prompt_id="p1",
        question="Q?",
        answer="An answer that is definitely long enough to compile.",
        traces=[],
    )
    first = asyncio.run(service.compile_for_prompt(**kwargs))
    second = asyncio.run(service.compile_for_prompt(**kwargs))
    assert first["report_id"] == second["report_id"]
    assert db.count_reports() == 1


def test_compile_uses_valid_llm_json(db):
    payload = {
        "title": "LLM Report",
        "summary": "LLM summary.",
        "findings": [
            {"text": "Qubits are used.", "source_ids": ["S1", "S99"], "quote": "qubits which can represent 0, 1, or both"},
        ],
        "disagreements": [],
        "limitations": "None.",
        "confidence": 0.8,
    }
    llm = FakeLLM(json.dumps(payload))
    service = _service(db, llm=llm)
    traces = [_web_search_trace(results=SEARCH_RESULTS)]

    report = asyncio.run(
        service.compile_for_prompt(
            prompt_id="p1",
            question="Q?",
            answer="A long enough answer to compile into a report.",
            traces=traces,
        )
    )

    assert llm.calls, "LLM should have been called"
    assert report["title"] == "LLM Report"
    assert report["findings"][0]["source_ids"] == ["S1"]  # S99 dropped
    assert report["findings"][0]["verified"] is True


def test_compile_falls_back_when_llm_errors(db):
    service = _service(db, llm=FakeLLM(RuntimeError("quota exceeded")))
    report = asyncio.run(
        service.compile_for_prompt(
            prompt_id="p1",
            question="Q?",
            answer="A long enough answer to compile into a report.\n\nSecond paragraph here.",
            traces=[_web_search_trace(results=SEARCH_RESULTS)],
        )
    )
    assert report is not None
    assert report["findings"]


def test_compile_falls_back_when_llm_returns_garbage(db):
    service = _service(db, llm=FakeLLM("I cannot do that."))
    report = asyncio.run(
        service.compile_for_prompt(
            prompt_id="p1",
            question="Q?",
            answer="A long enough answer to compile into a report.",
            traces=[],
        )
    )
    assert report is not None
    assert report["findings"]


def test_compile_falls_back_when_factory_broken(db):
    service = ReportService(database=db, storage=None, llm_factory=BrokenFactory(), enabled=True)
    report = asyncio.run(
        service.compile_for_prompt(
            prompt_id="p1",
            question="Q?",
            answer="A long enough answer to compile into a report.",
            traces=[],
        )
    )
    assert report is not None


def test_compile_skips_trivial_answers(db):
    service = _service(db)
    report = asyncio.run(
        service.compile_for_prompt(prompt_id="p1", question="Q?", answer="ok", traces=[])
    )
    assert report is None
    assert db.count_reports() == 0


def test_compile_disabled_returns_none(db):
    service = ReportService(database=db, storage=None, llm_factory=None, enabled=False)
    report = asyncio.run(
        service.compile_for_prompt(
            prompt_id="p1",
            question="Q?",
            answer="A long enough answer to compile into a report.",
            traces=[],
        )
    )
    assert report is None


def test_html_for_regenerates_from_structured_data(db):
    service = _service(db)
    report = asyncio.run(
        service.compile_for_prompt(
            prompt_id="p1",
            question="Q?",
            answer="A long enough answer to compile into a report.",
            traces=[],
        )
    )
    html = service.html_for(report)
    assert "<html" in html
    assert report["title"] in html
