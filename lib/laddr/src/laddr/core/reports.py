"""
Cited research reports.

Turns a completed agent run (final answer + execution traces) into a
structured, citable report artifact.

Design goals
------------
- **Never break the caller.** Every compilation step is contained; a failure
  to build a report must never fail the underlying agent run.
- **Work with or without an LLM.** A structured LLM pass is attempted first;
  if the LLM is unavailable (no key, quota, timeout, invalid JSON) we fall
  back to a deterministic compiler that still produces a usable, honest
  report with sources and unverified claims clearly marked.
- **No new third-party dependencies.** Rendering is plain Python.

The report is a first-class object:

    ReportDraft
      ├── title / summary / limitations / confidence
      ├── findings[]  -> text + source_ids + verbatim quote + verified flag
      └── sources[]   -> id + url + title + domain + snippet
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime
import html as html_lib
import json
import logging
import os
import re
import uuid
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

logger = logging.getLogger(__name__)

_TRACKING_PARAMS = (
    "utm_",
    "gclid",
    "fbclid",
    "mc_cid",
    "mc_eid",
    "ref_src",
)
_URL_RE = re.compile(r"https?://[^\s<>\"')\]]+")
_CITATION_RE = re.compile(r"\[(S?\d{1,3})\]")
_WS_RE = re.compile(r"\s+")
_WORD_RE = re.compile(r"[a-z]{4,}")

MAX_SOURCES = 30
MAX_FINDINGS = 12


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------


@dataclass
class ReportSource:
    """A source that was actually retrieved during the run."""

    id: str
    url: str
    title: str
    domain: str
    snippet: str | None = None
    retrieved_at: str | None = None
    tool: str | None = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "url": self.url,
            "title": self.title,
            "domain": self.domain,
            "snippet": self.snippet,
            "retrieved_at": self.retrieved_at,
            "tool": self.tool,
        }


@dataclass
class ReportFinding:
    """A single claim in the report, optionally backed by sources."""

    text: str
    source_ids: list[str] = field(default_factory=list)
    quote: str | None = None
    verified: bool = False

    def to_dict(self) -> dict:
        return {
            "text": self.text,
            "source_ids": self.source_ids,
            "quote": self.quote,
            "verified": self.verified,
        }


@dataclass
class ReportDraft:
    """Structured report content, before persistence."""

    title: str
    summary: str
    findings: list[ReportFinding] = field(default_factory=list)
    disagreements: list[str] = field(default_factory=list)
    limitations: str = ""
    confidence: float = 0.0
    sources: list[ReportSource] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------


def truncate(text: object, limit: int) -> str:
    """Collapse whitespace and truncate to ``limit`` characters."""
    value = _WS_RE.sub(" ", str(text or "")).strip()
    if len(value) <= limit:
        return value
    return value[: max(0, limit - 1)].rstrip() + "…"


def maybe_json(value: object) -> object:
    """Best-effort JSON decoding for values stored as strings."""
    if isinstance(value, str):
        stripped = value.strip()
        if stripped[:1] in "{[":
            try:
                return json.loads(stripped)
            except Exception:
                return value
    return value


def normalize_url(url: str) -> str:
    """Normalize a URL for deduplication (scheme/host/tracking/fragment)."""
    if not url:
        return ""
    raw = str(url).strip()
    try:
        parts = urlsplit(raw)
    except ValueError:
        return raw
    if not parts.scheme:
        parts = urlsplit("https://" + raw)
    host = (parts.netloc or "").lower()
    if host.startswith("www."):
        host = host[4:]
    if not host:
        return ""
    query = [
        (key, value)
        for key, value in parse_qsl(parts.query, keep_blank_values=True)
        if not key.lower().startswith(_TRACKING_PARAMS)
    ]
    path = parts.path.rstrip("/") or "/"
    # Treat http and https (and bare hosts) as the same resource so the same
    # article is never listed twice under different schemes.
    scheme = (parts.scheme or "").lower()
    if scheme not in {"http", "https"}:
        scheme = scheme or "https"
    else:
        scheme = "https"
    return urlunsplit((scheme, host, path, urlencode(query), ""))


def domain_of(url: str) -> str:
    try:
        host = (urlsplit(url).netloc or "").lower()
    except ValueError:
        return ""
    if host.startswith("www."):
        host = host[4:]
    return host


def coerce_answer(value: object) -> str:
    """Extract the human-readable answer from an agent output value.

    Agent outputs may be a plain string, a JSON string, or a dict with
    ``text`` / ``response`` / ``result`` / ``answer``.
    """
    if value is None:
        return ""
    if isinstance(value, str):
        parsed = maybe_json(value)
        if isinstance(parsed, (dict, list)):
            return coerce_answer(parsed)
        return value
    if isinstance(value, dict):
        if value.get("error"):
            return ""
        # Sequential chains return {"results": [{"agent": ..., "result": ...}, ...]}
        chain_results = value.get("results")
        if isinstance(chain_results, list) and chain_results:
            last = chain_results[-1]
            if isinstance(last, dict):
                nested = coerce_answer(last.get("result") or last)
                if nested.strip():
                    return nested
            elif isinstance(last, str):
                return last
        for key in ("text", "response", "result", "answer", "output", "content"):
            candidate = value.get(key)
            if isinstance(candidate, str) and candidate.strip():
                return candidate
            if isinstance(candidate, dict):
                nested = coerce_answer(candidate)
                if nested.strip():
                    return nested
        return ""
    if isinstance(value, list):
        return "\n".join(str(item) for item in value if item is not None)
    return str(value)


def extract_question(inputs: object) -> str:
    """Pull the user's question out of an inputs dict."""
    if isinstance(inputs, str):
        return inputs.strip()
    if not isinstance(inputs, dict):
        return ""
    for key in ("query", "prompt", "question", "message", "task", "input", "text"):
        value = inputs.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    try:
        return truncate(json.dumps(inputs, default=str), 500)
    except Exception:
        return ""


# ---------------------------------------------------------------------------
# Source extraction
# ---------------------------------------------------------------------------


def extract_sources(
    traces: list[dict],
    answer_text: str = "",
    max_sources: int = MAX_SOURCES,
) -> list[ReportSource]:
    """Collect deduplicated sources from tool traces (and the answer text).

    Recognizes ``web_search`` and ``scrape_url`` tool results produced by the
    bundled research tools. Unknown tool shapes are ignored safely.
    """
    ordered: list[ReportSource] = []
    by_key: dict[str, ReportSource] = {}

    def add(url: str, title: str = "", snippet: str = "", tool: str | None = None, at: str | None = None) -> None:
        key = normalize_url(url)
        if not key:
            return
        existing = by_key.get(key)
        if existing is not None:
            if not existing.snippet and snippet:
                existing.snippet = truncate(snippet, 500)
            if (not existing.title or existing.title == existing.domain) and title:
                existing.title = truncate(title, 300)
            return
        if len(ordered) >= max_sources:
            return
        source = ReportSource(
            id="",
            url=str(url).strip(),
            title=truncate(title, 300) or domain_of(url) or key,
            domain=domain_of(url),
            snippet=truncate(snippet, 500) or None,
            retrieved_at=at,
            tool=tool,
        )
        by_key[key] = source
        ordered.append(source)

    for trace in sorted(traces or [], key=lambda item: item.get("id", 0) or 0):
        if trace.get("event_type") != "tool_result":
            continue
        payload = maybe_json(trace.get("payload") or {})
        if not isinstance(payload, dict):
            continue
        tool = payload.get("tool")
        result = maybe_json(payload.get("result"))
        at = payload.get("ended_at") or trace.get("timestamp")
        if not isinstance(result, dict):
            continue
        status = str(result.get("status") or payload.get("status") or "").lower()
        if status in {"error", "failed"} and not result.get("results"):
            continue

        if tool == "web_search":
            for item in result.get("results") or []:
                if not isinstance(item, dict):
                    continue
                add(
                    url=item.get("link") or item.get("url") or "",
                    title=item.get("title") or "",
                    snippet=item.get("snippet") or item.get("description") or "",
                    tool=tool,
                    at=at,
                )
        elif tool == "scrape_url":
            add(
                url=result.get("url") or "",
                title=result.get("title") or "",
                snippet=result.get("text") or "",
                tool=tool,
                at=at,
            )

    # Fallback: URLs explicitly present in the answer.
    for match in _URL_RE.findall(answer_text or ""):
        add(url=match, title="", snippet="", tool="answer")

    for index, source in enumerate(ordered, start=1):
        source.id = f"S{index}"

    return ordered


# ---------------------------------------------------------------------------
# Methodology (from traces)
# ---------------------------------------------------------------------------


def build_methodology(traces: list[dict], limit: int = 30) -> list[dict]:
    """Build a compact, human-readable execution timeline from traces."""
    steps: list[dict] = []
    for trace in sorted(traces or [], key=lambda item: item.get("id", 0) or 0):
        event = trace.get("event_type")
        if event not in {"task_start", "tool_call", "tool_result", "task_complete", "task_error"}:
            continue
        payload = maybe_json(trace.get("payload") or {})
        if not isinstance(payload, dict):
            payload = {}
        step = {
            "agent": trace.get("agent_name"),
            "event": event,
            "at": trace.get("timestamp"),
        }
        if event == "tool_call":
            step["tool"] = payload.get("tool")
            params = payload.get("params") or {}
            if isinstance(params, dict):
                preview = params.get("query") or params.get("url") or params.get("agent_name") or params.get("task")
                if preview:
                    step["detail"] = truncate(preview, 180)
        elif event == "tool_result":
            step["tool"] = payload.get("tool")
            step["status"] = payload.get("status")
            step["duration_ms"] = payload.get("duration_ms")
        elif event in {"task_complete", "task_error"}:
            step["status"] = payload.get("status")
        steps.append(step)
        if len(steps) >= limit:
            break
    return steps


# ---------------------------------------------------------------------------
# Deterministic compiler (no LLM)
# ---------------------------------------------------------------------------


def _split_blocks(answer: str) -> list[str]:
    text = (answer or "").replace("\r\n", "\n").strip()
    if not text:
        return []
    blocks = [block.strip() for block in re.split(r"\n\s*\n", text) if block.strip()]
    if len(blocks) <= 1:
        blocks = []
        current: list[str] = []
        for line in (line.strip() for line in text.split("\n")):
            if not line:
                continue
            if re.match(r"^(\*|-|\d+[.)])\s+", line) and current:
                blocks.append(" ".join(current))
                current = [line]
            else:
                current.append(line)
        if current:
            blocks.append(" ".join(current))

    cleaned_blocks: list[str] = []
    for block in blocks:
        cleaned = re.sub(r"^#+\s*", "", block)
        cleaned = re.sub(r"^(\*|-|\d+[.)])\s+", "", cleaned)
        cleaned = _WS_RE.sub(" ", cleaned).strip()
        if len(cleaned) >= 25:
            cleaned_blocks.append(cleaned)
    return cleaned_blocks


def _match_sources(text: str, sources: list[ReportSource]) -> list[str]:
    valid = {source.id for source in sources}
    matched: list[str] = []

    for match in _CITATION_RE.finditer(text or ""):
        token = match.group(1)
        source_id = token if token.startswith("S") else f"S{token}"
        if source_id in valid and source_id not in matched:
            matched.append(source_id)
    if matched:
        return matched[:3]

    lowered = (text or "").lower()
    for source in sources:
        if source.url and source.url.lower() in lowered:
            matched.append(source.id)
        elif source.domain and source.domain.lower() in lowered:
            matched.append(source.id)

    if not matched:
        words = set(_WORD_RE.findall(lowered))
        for source in sources:
            title_words = set(_WORD_RE.findall((source.title or "").lower()))
            if title_words and len(title_words & words) >= 3:
                matched.append(source.id)

    deduped: list[str] = []
    for source_id in matched:
        if source_id not in deduped:
            deduped.append(source_id)
    return deduped[:3]


def _derive_title(question: str, answer: str) -> str:
    for line in (answer or "").splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("#"):
            candidate = stripped.lstrip("#").strip()
            if candidate:
                return truncate(candidate, 140)
        bold = re.match(r"^\*\*(.+?)\*\*$", stripped)
        if bold:
            return truncate(bold.group(1), 140)
        break
    if question:
        return truncate(question, 140)
    return "Research report"


def deterministic_draft(
    question: str,
    answer: str,
    sources: list[ReportSource],
) -> ReportDraft:
    """Produce a usable report without any LLM involvement."""
    blocks = _split_blocks(answer)[:MAX_FINDINGS]
    findings: list[ReportFinding] = []
    for block in blocks:
        source_ids = _match_sources(block, sources)
        quote = None
        if source_ids:
            source = next((item for item in sources if item.id == source_ids[0]), None)
            if source and source.snippet:
                quote = truncate(source.snippet, 280)
        findings.append(
            ReportFinding(
                text=truncate(block, 700),
                source_ids=source_ids,
                quote=quote,
                verified=bool(source_ids) and bool(quote),
            )
        )

    verified = sum(1 for finding in findings if finding.verified)
    ratio = verified / len(findings) if findings else 0.0
    confidence = round(min(0.85, 0.30 + 0.55 * ratio), 2) if findings else 0.1

    summary_source = blocks[0] if blocks else (answer or "")
    return ReportDraft(
        title=_derive_title(question, answer),
        summary=truncate(summary_source, 420),
        findings=findings,
        disagreements=[],
        limitations=(
            "Generated automatically from the agent's final answer. Quotes are drawn from "
            "search result snippets; verify each claim against the linked source before "
            "relying on it."
        ),
        confidence=confidence,
        sources=list(sources),
    )


# ---------------------------------------------------------------------------
# LLM compiler
# ---------------------------------------------------------------------------

_REPORT_SYSTEM_PROMPT = """You are a meticulous research editor.
Convert the research answer into a structured report for a human reader.

Hard rules:
- Only use the numbered sources provided. Never invent source ids, URLs, or facts.
- Every finding must be one specific, self-contained claim.
- Attach the ids of the sources that support the claim, e.g. ["S1", "S3"].
- Provide a short verbatim quote from that source's snippet as evidence when available.
- If a claim has no supporting source, return an empty source_ids list. Do not guess.
- Put genuine contradictions between sources in "disagreements".
- Do not repeat the same claim twice.
- Return STRICT JSON only (no markdown fences, no commentary) matching this schema:
{
  "title": "short report title",
  "summary": "2-4 sentence executive summary",
  "findings": [
    {"text": "claim", "source_ids": ["S1"], "quote": "verbatim supporting sentence"}
  ],
  "disagreements": ["description of a contradiction, if any"],
  "limitations": "what this report could not establish",
  "confidence": 0.0
}
"confidence" is a number between 0 and 1 reflecting how well the sources support the findings."""


def _build_llm_user_prompt(question: str, answer: str, sources: list[ReportSource]) -> str:
    lines = [
        "QUESTION:",
        question or "(not provided)",
        "",
        "RESEARCH ANSWER:",
        truncate(answer, 6000),
        "",
        "SOURCES:",
    ]
    if not sources:
        lines.append("(no sources were retrieved)")
    for source in sources[:20]:
        lines.append(f"[{source.id}] {source.title}")
        lines.append(f"URL: {source.url}")
        if source.snippet:
            lines.append(f"Snippet: {truncate(source.snippet, 400)}")
        lines.append("")
    return "\n".join(lines)


def parse_json_loose(text: str) -> object:
    """Parse JSON from an LLM response, tolerating fences and prose."""
    if not text:
        return None
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```[a-zA-Z0-9_-]*\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned).strip()
    try:
        return json.loads(cleaned)
    except Exception:
        pass
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start >= 0 and end > start:
        try:
            return json.loads(cleaned[start : end + 1])
        except Exception:
            return None
    return None


def _draft_from_payload(payload: object, sources: list[ReportSource]) -> ReportDraft | None:
    if not isinstance(payload, dict):
        return None

    raw_findings = payload.get("findings")
    if not isinstance(raw_findings, list):
        return None

    findings: list[ReportFinding] = []
    for item in raw_findings:
        if isinstance(item, str):
            item = {"text": item}
        if not isinstance(item, dict):
            continue
        text = item.get("text") or item.get("claim") or item.get("statement")
        if not isinstance(text, str) or not text.strip():
            continue
        source_ids = item.get("source_ids") or item.get("sources") or []
        if isinstance(source_ids, (str, int)):
            source_ids = [source_ids]
        if not isinstance(source_ids, list):
            source_ids = []
        findings.append(
            ReportFinding(
                text=text.strip(),
                source_ids=[str(value).strip() for value in source_ids],
                quote=item.get("quote") if isinstance(item.get("quote"), str) else None,
                verified=False,
            )
        )

    disagreements = payload.get("disagreements") or []
    if isinstance(disagreements, str):
        disagreements = [disagreements]
    disagreements = [str(item).strip() for item in disagreements if str(item).strip()]

    confidence = payload.get("confidence")
    try:
        confidence = float(confidence) if confidence is not None else None
    except (TypeError, ValueError):
        confidence = None

    return ReportDraft(
        title=str(payload.get("title") or "").strip(),
        summary=str(payload.get("summary") or "").strip(),
        findings=findings,
        disagreements=disagreements,
        limitations=str(payload.get("limitations") or "").strip(),
        confidence=confidence if confidence is not None else 0.0,
        sources=list(sources),
    )


def validate_draft(draft: ReportDraft, sources: list[ReportSource]) -> ReportDraft:
    """Drop unknown source ids, mark verification, and recompute confidence."""
    valid_ids = {source.id for source in sources}
    findings: list[ReportFinding] = []
    seen: set[str] = set()

    for finding in draft.findings:
        text = truncate(finding.text, 800)
        if not text:
            continue
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)

        source_ids: list[str] = []
        for raw_id in finding.source_ids or []:
            source_id = str(raw_id).strip()
            if source_id.isdigit():
                source_id = f"S{source_id}"
            if source_id in valid_ids and source_id not in source_ids:
                source_ids.append(source_id)

        quote = truncate(finding.quote, 400) if finding.quote else None
        verified = bool(source_ids) and bool(quote and len(quote) >= 12)
        findings.append(
            ReportFinding(text=text, source_ids=source_ids, quote=quote, verified=verified)
        )

    total = len(findings)
    verified_count = sum(1 for finding in findings if finding.verified)
    ratio = verified_count / total if total else 0.0

    confidence = float(draft.confidence or 0.0)
    if total and ratio < 1.0:
        confidence = min(confidence, 0.50 + 0.50 * ratio)
    confidence = max(0.0, min(1.0, confidence))
    if not total:
        confidence = 0.0

    title = truncate(draft.title, 160) or "Research report"
    summary = truncate(draft.summary, 700)
    limitations = truncate(draft.limitations, 700)

    return ReportDraft(
        title=title,
        summary=summary,
        findings=findings,
        disagreements=[truncate(item, 300) for item in draft.disagreements][:5],
        limitations=limitations,
        confidence=round(confidence, 2),
        sources=list(sources),
    )


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------


def _citation_markup(source_ids: list[str]) -> str:
    return " ".join(f"[{source_id}]" for source_id in source_ids)


def render_markdown(draft: ReportDraft, question: str, generated_at: str) -> str:
    """Render the report as portable Markdown."""
    lines: list[str] = [f"# {draft.title}", ""]
    if draft.summary:
        lines += [f"> {draft.summary}", ""]
    lines += [
        f"- **Question:** {question or '(not provided)'}",
        f"- **Generated:** {generated_at}",
        f"- **Confidence:** {round(draft.confidence * 100)}%",
        f"- **Sources:** {len(draft.sources)}",
        "",
    ]

    lines += ["## Findings", ""]
    if draft.findings:
        for index, finding in enumerate(draft.findings, start=1):
            citation = f" {_citation_markup(finding.source_ids)}" if finding.source_ids else ""
            lines.append(f"{index}. {finding.text}{citation}")
            if finding.quote:
                lines.append(f"   > {finding.quote}")
            if not finding.verified:
                lines.append("   _(unverified — no supporting source quote)_")
            lines.append("")
    else:
        lines += ["_No findings were extracted from this run._", ""]

    if draft.disagreements:
        lines += ["## Disagreements", ""]
        lines += [f"- {item}" for item in draft.disagreements]
        lines.append("")

    if draft.limitations:
        lines += ["## Limitations", "", draft.limitations, ""]

    lines += ["## Sources", ""]
    if draft.sources:
        lines += ["| ID | Source | URL |", "| --- | --- | --- |"]
        for source in draft.sources:
            title = (source.title or source.domain or source.url).replace("|", "\\|")
            url = source.url.replace("|", "\\|")
            lines.append(f"| {source.id} | {title} | {url} |")
        lines.append("")
    else:
        lines += ["_No sources were retrieved for this run._", ""]

    return "\n".join(lines).strip() + "\n"


def render_html(draft: ReportDraft, question: str, generated_at: str) -> str:
    """Render a self-contained, print-friendly HTML document."""
    escape = html_lib.escape

    findings_html: list[str] = []
    for index, finding in enumerate(draft.findings, start=1):
        citations = "".join(
            f'<a class="cite" href="#source-{escape(source_id)}">{escape(source_id)}</a>'
            for source_id in finding.source_ids
        )
        quote_html = (
            f'<blockquote>{escape(finding.quote)}</blockquote>' if finding.quote else ""
        )
        badge = (
            ""
            if finding.verified
            else '<span class="badge warn">unverified</span>'
        )
        findings_html.append(
            f'<li class="finding"><div class="finding-text">{escape(finding.text)} {citations} {badge}</div>{quote_html}</li>'
        )

    sources_html: list[str] = []
    for source in draft.sources:
        snippet_html = f'<p class="snippet">{escape(source.snippet)}</p>' if source.snippet else ""
        sources_html.append(
            f'<div class="source" id="source-{escape(source.id)}">'
            f'<div class="source-head"><span class="sid">{escape(source.id)}</span>'
            f'<a href="{escape(source.url)}" target="_blank" rel="noopener noreferrer">{escape(source.title or source.domain)}</a></div>'
            f'<div class="domain">{escape(source.domain)}</div>{snippet_html}</div>'
        )

    disagreements_html = ""
    if draft.disagreements:
        items = "".join(f"<li>{escape(item)}</li>" for item in draft.disagreements)
        disagreements_html = f'<section><h2>Disagreements</h2><ul class="disagreements">{items}</ul></section>'

    limitations_html = (
        f'<section><h2>Limitations</h2><p class="muted">{escape(draft.limitations)}</p></section>'
        if draft.limitations
        else ""
    )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{escape(draft.title)}</title>
<style>
  :root {{ color-scheme: light; }}
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; padding: 48px 24px; background: #f7f8f8; color: #1a1c1c;
         font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
         line-height: 1.6; }}
  main {{ max-width: 820px; margin: 0 auto; background: #fff; padding: 48px;
          border: 1px solid #e4e7e7; border-radius: 12px; }}
  h1 {{ font-size: 30px; line-height: 1.25; margin: 0 0 16px; }}
  h2 {{ font-size: 18px; margin: 36px 0 12px; padding-bottom: 6px; border-bottom: 1px solid #eceeee; }}
  .summary {{ font-size: 17px; color: #333; border-left: 3px solid #1FB8CD; padding-left: 16px; margin: 0 0 24px; }}
  .meta {{ display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }}
  .chip {{ font-size: 12px; background: #f0f4f4; border: 1px solid #e2e8e8; border-radius: 999px;
           padding: 3px 10px; color: #4a5252; }}
  .finding {{ margin-bottom: 18px; }}
  .finding-text {{ font-size: 15px; }}
  blockquote {{ margin: 8px 0 0; padding: 8px 14px; background: #f7f9f9;
                border-left: 2px solid #cfd8d8; color: #4c5555; font-size: 14px; }}
  .cite {{ display: inline-block; font-size: 11px; font-weight: 600; text-decoration: none;
           color: #0b7f90; background: #e7f6f8; border-radius: 4px; padding: 0 5px; margin-left: 2px; }}
  .badge {{ font-size: 10px; text-transform: uppercase; letter-spacing: .04em;
            border-radius: 4px; padding: 1px 6px; margin-left: 6px; }}
  .badge.warn {{ background: #fff4e5; color: #a15c00; border: 1px solid #ffd9a8; }}
  .source {{ border: 1px solid #eceeee; border-radius: 8px; padding: 14px 16px; margin-bottom: 10px; }}
  .source-head {{ display: flex; gap: 10px; align-items: baseline; font-weight: 600; }}
  .source-head a {{ color: #0b7f90; text-decoration: none; }}
  .sid {{ font-size: 11px; background: #e7f6f8; color: #0b7f90; border-radius: 4px; padding: 1px 6px; }}
  .domain {{ font-size: 12px; color: #7a8585; margin-top: 2px; }}
  .snippet {{ font-size: 13px; color: #4c5555; margin: 8px 0 0; }}
  .muted {{ color: #5c6666; }}
  .disagreements li {{ margin-bottom: 6px; }}
  .toolbar {{ max-width: 820px; margin: 0 auto 16px; display: flex; justify-content: flex-end; }}
  .toolbar button {{ font: inherit; font-size: 13px; padding: 8px 16px; border-radius: 8px;
                     border: 1px solid #1FB8CD; background: #1FB8CD; color: #fff; cursor: pointer; }}
  footer {{ max-width: 820px; margin: 24px auto 0; font-size: 12px; color: #8a9494; }}
  @media print {{
    body {{ background: #fff; padding: 0; }}
    main {{ border: 0; border-radius: 0; padding: 0; max-width: none; }}
    .toolbar {{ display: none; }}
    .source {{ break-inside: avoid; }}
    a {{ color: inherit; }}
  }}
</style>
</head>
<body>
  <div class="toolbar no-print">
    <button onclick="window.print()">Print / Save as PDF</button>
  </div>
  <main>
    <h1>{escape(draft.title)}</h1>
    <div class="meta">
      <span class="chip">Confidence {round(draft.confidence * 100)}%</span>
      <span class="chip">{len(draft.sources)} sources</span>
      <span class="chip">{len(draft.findings)} findings</span>
      <span class="chip">{escape(generated_at)}</span>
    </div>
    {f'<p class="summary">{escape(draft.summary)}</p>' if draft.summary else ''}
    <p class="muted"><strong>Question:</strong> {escape(question or '(not provided)')}</p>
    <section>
      <h2>Findings</h2>
      <ol class="findings">{''.join(findings_html) or '<li class="muted">No findings were extracted.</li>'}</ol>
    </section>
    {disagreements_html}
    {limitations_html}
    <section>
      <h2>Sources</h2>
      {''.join(sources_html) or '<p class="muted">No sources were retrieved for this run.</p>'}
    </section>
  </main>
  <footer>Generated by Laddr. Citations link to the original sources.</footer>
</body>
</html>
"""


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class ReportService:
    """Compile, persist, and serve cited reports."""

    def __init__(
        self,
        database: object,
        storage: object | None = None,
        llm_factory: object | None = None,
        bucket: str | None = None,
        enabled: bool | None = None,
    ) -> None:
        self.database = database
        self.storage = storage
        self.llm_factory = llm_factory
        self.bucket = bucket or os.getenv("LADDR_REPORTS_BUCKET", "laddr-reports")
        if enabled is None:
            enabled = str(os.getenv("LADDR_REPORTS_ENABLED", "1")).lower() not in {"0", "false", "no", "off"}
        self.enabled = enabled
        try:
            self.timeout_seconds = float(os.getenv("LADDR_REPORTS_TIMEOUT", "60"))
        except ValueError:
            self.timeout_seconds = 60.0

    # -- LLM pass ---------------------------------------------------------

    async def _llm_draft(
        self,
        question: str,
        answer: str,
        sources: list[ReportSource],
        agent_name: str | None = None,
    ) -> ReportDraft | None:
        if self.llm_factory is None:
            return None

        # Resolve the backend the same way the agent runtime does:
        # explicit report override -> per-agent env -> global config.
        override = os.getenv("LADDR_REPORTS_LLM") or None
        model = os.getenv("LADDR_REPORTS_LLM_MODEL") or None
        if agent_name:
            key = re.sub(r"[^A-Za-z0-9]", "_", agent_name).upper()
            override = override or os.getenv(f"LLM_BACKEND_{key}") or None
            model = model or os.getenv(f"LLM_MODEL_{key}") or None

        try:
            llm = self.llm_factory.create_llm_backend(
                override=override,
                model_override=model,
                agent_name=agent_name,
            )
        except Exception as exc:
            logger.debug("Could not create report LLM backend: %s", exc)
            return None
        if llm is None or type(llm).__name__ == "NoOpLLM":
            return None

        prompt = _build_llm_user_prompt(question, answer, sources)
        try:
            raw = await llm.generate(prompt, system=_REPORT_SYSTEM_PROMPT)
        except Exception as exc:
            logger.info("Report LLM call failed, using deterministic compiler: %s", exc)
            return None

        payload = parse_json_loose(raw if isinstance(raw, str) else str(raw))
        draft = _draft_from_payload(payload, sources)
        if draft is None or not draft.findings:
            return None
        return draft

    # -- Compilation ------------------------------------------------------

    async def compile_for_prompt(
        self,
        prompt_id: str,
        question: str,
        answer: object,
        traces: list[dict] | None = None,
        agent_name: str | None = None,
        force: bool = False,
    ) -> dict | None:
        """Build and persist a report for a completed prompt execution.

        Returns the stored report dict, or ``None`` if there was nothing to
        report or compilation was disabled. Never raises for expected errors.
        """
        if not self.enabled:
            return None

        text = coerce_answer(answer)
        if not text or len(text.strip()) < 20:
            return None

        if not force:
            try:
                existing = self.database.get_report_by_prompt(prompt_id)
            except Exception:
                existing = None
            if existing:
                return existing

        sources = extract_sources(traces or [], text)
        methodology = build_methodology(traces or [])

        draft: ReportDraft | None = None
        try:
            draft = await asyncio.wait_for(
                self._llm_draft(question, text, sources, agent_name=agent_name),
                timeout=self.timeout_seconds,
            )
        except asyncio.TimeoutError:
            logger.info("Report LLM compilation timed out after %.0fs", self.timeout_seconds)
        except Exception as exc:
            logger.info("Report LLM compilation failed: %s", exc)

        if draft is None:
            draft = deterministic_draft(question, text, sources)

        draft = validate_draft(draft, sources)
        if not draft.findings:
            draft = validate_draft(deterministic_draft(question, text, sources), sources)

        if not draft.title or draft.title == "Research report":
            draft.title = _derive_title(question, text)

        now = datetime.utcnow()
        generated_at = now.strftime("%Y-%m-%d %H:%M UTC")
        markdown = render_markdown(draft, question, generated_at)
        html_doc = render_html(draft, question, generated_at)

        report_id = str(uuid.uuid4())
        markdown_key, html_key = await self._store(report_id, markdown, html_doc)

        sources_payload = [source.to_dict() for source in draft.sources]
        findings_payload = [finding.to_dict() for finding in draft.findings]
        verified_count = sum(1 for finding in draft.findings if finding.verified)

        try:
            self.database.create_report(
                report_id=report_id,
                prompt_id=prompt_id,
                job_id=prompt_id,
                question=question,
                title=draft.title,
                status="complete",
                agent_name=agent_name,
                summary=draft.summary,
                markdown=markdown,
                sources=sources_payload,
                findings=findings_payload,
                disagreements=draft.disagreements,
                limitations=draft.limitations,
                confidence=draft.confidence,
                methodology=methodology,
                source_count=len(draft.sources),
                verified_count=verified_count,
                markdown_key=markdown_key,
                html_key=html_key,
            )
        except Exception:
            logger.exception("Failed to persist report for prompt %s", prompt_id)
            return None

        return self.database.get_report(report_id)

    # -- Storage ----------------------------------------------------------

    async def _store(self, report_id: str, markdown: str, html_doc: str) -> tuple[str | None, str | None]:
        if self.storage is None:
            return None, None
        markdown_key = f"reports/{report_id}/report.md"
        html_key = f"reports/{report_id}/report.html"
        try:
            await self.storage.ensure_bucket(self.bucket)
            await self.storage.put_object(
                self.bucket,
                markdown_key,
                markdown.encode("utf-8"),
                {"Content-Type": "text/markdown; charset=utf-8"},
            )
            await self.storage.put_object(
                self.bucket,
                html_key,
                html_doc.encode("utf-8"),
                {"Content-Type": "text/html; charset=utf-8"},
            )
            return markdown_key, html_key
        except Exception as exc:
            logger.warning("Could not store report artifacts (%s); keeping DB copy only", exc)
            return None, None

    # -- Retrieval helpers ------------------------------------------------

    def html_for(self, report: dict) -> str:
        """Return HTML for a report, regenerating it from structured data if needed."""
        draft = ReportDraft(
            title=report.get("title") or "Research report",
            summary=report.get("summary") or "",
            findings=[
                ReportFinding(
                    text=item.get("text", ""),
                    source_ids=item.get("source_ids") or [],
                    quote=item.get("quote"),
                    verified=bool(item.get("verified")),
                )
                for item in report.get("findings") or []
            ],
            disagreements=report.get("disagreements") or [],
            limitations=report.get("limitations") or "",
            confidence=float(report.get("confidence") or 0.0),
            sources=[
                ReportSource(
                    id=item.get("id", ""),
                    url=item.get("url", ""),
                    title=item.get("title", ""),
                    domain=item.get("domain", ""),
                    snippet=item.get("snippet"),
                    retrieved_at=item.get("retrieved_at"),
                    tool=item.get("tool"),
                )
                for item in report.get("sources") or []
            ],
        )
        generated_at = (report.get("created_at") or "").replace("T", " ").replace("Z", " UTC")
        return render_html(draft, report.get("question") or "", generated_at)
