"""Visual agent graph compilation and execution.

A graph is a DAG of nodes (agent/tool/conditional/input/output) connected by
edges. This module compiles a graph into an execution plan and runs it using
the existing AgentRunner, so no new runtime engine is needed.
"""

from __future__ import annotations

import asyncio
from datetime import datetime
import time
import uuid
from typing import Any


class GraphValidationError(Exception):
    pass


def _topological_waves(nodes: list[dict], edges: list[dict]) -> list[list[str]]:
    """Return node ids grouped into execution waves (parallel within a wave)."""
    node_ids = {n["id"] for n in nodes}
    incoming = {nid: set() for nid in node_ids}
    outgoing = {nid: [] for nid in node_ids}
    for e in edges:
        src, tgt = e.get("source"), e.get("target")
        if src in node_ids and tgt in node_ids:
            incoming[tgt].add(src)
            outgoing[src].append(tgt)

    # Cycle detection
    visited, on_stack = set(), set()
    def dfs(nid):
        if nid in on_stack:
            raise GraphValidationError("Graph contains a cycle")
        if nid in visited:
            return
        on_stack.add(nid)
        for tgt in outgoing[nid]:
            dfs(tgt)
        on_stack.discard(nid)
        visited.add(nid)
    for nid in node_ids:
        dfs(nid)

    remaining = set(node_ids)
    done = set()
    waves: list[list[str]] = []
    while remaining:
        wave = [nid for nid in remaining if incoming[nid].issubset(done)]
        if not wave:
            raise GraphValidationError("Graph has unresolved dependencies")
        waves.append(sorted(wave))
        for nid in wave:
            remaining.discard(nid)
            done.add(nid)
    return waves


def validate_graph(nodes: list[dict], edges: list[dict]) -> None:
    if not nodes:
        raise GraphValidationError("Graph has no nodes")
    ids = [n.get("id") for n in nodes]
    if len(set(ids)) != len(ids):
        raise GraphValidationError("Duplicate node ids")
    for n in nodes:
        if not n.get("id"):
            raise GraphValidationError("Node missing id")
        if n.get("type") not in {"input", "output", "agent", "tool", "conditional", "merge"}:
            raise GraphValidationError(f"Unknown node type: {n.get('type')}")
        if n.get("type") == "agent" and not n.get("agent_name"):
            raise GraphValidationError(f"Agent node {n['id']} missing agent_name")
    for e in edges:
        if e.get("source") not in ids or e.get("target") not in ids:
            raise GraphValidationError(f"Edge references unknown node: {e}")
    # cycle detection
    _topological_waves(nodes, edges)


def _upstream_outputs(node_id: str, edges: list[dict], results: dict) -> dict:
    """Merge outputs from all upstream nodes into a single input dict."""
    merged: dict[str, Any] = {}
    for e in edges:
        if e.get("target") == node_id:
            src = e.get("source")
            src_result = results.get(src, {})
            out = src_result.get("output", src_result.get("result", {}))
            if isinstance(out, dict):
                merged.update(out)
            elif out is not None:
                merged.setdefault("input", out)
    return merged


def _eval_condition(edge: dict, upstream: dict) -> bool:
    cond = edge.get("condition")
    if not cond:
        return True
    # cond: {"field": "branch", "equals": "true"} or {"expr": "output.score > 0.5"}
    if "equals" in cond:
        field = cond.get("field", "branch")
        val = upstream.get(field)
        if isinstance(upstream, dict) and field in upstream:
            val = upstream.get(field)
        return str(val).lower() == str(cond["equals"]).lower()
    if "expr" in cond:
        # Safe-ish eval against upstream dict
        try:
            return bool(eval(cond["expr"], {"__builtins__": {}}, {"output": upstream, "upstream": upstream}))
        except Exception:
            return False
    return True


class GraphExecutor:
    """Executes a graph DAG using an AgentRunner."""

    def __init__(self, runner, database):
        self.runner = runner
        self.database = database

    async def run(self, graph: dict, inputs: dict, run_id: str) -> dict:
        nodes = graph.get("nodes", [])
        edges = graph.get("edges", [])
        validate_graph(nodes, edges)

        node_map = {n["id"]: n for n in nodes}
        waves = _topological_waves(nodes, edges)

        node_results: dict[str, dict] = {}
        # seed input node
        for n in nodes:
            if n.get("type") == "input":
                node_results[n["id"]] = {"status": "completed", "output": inputs or {}, "started_at": _now(), "completed_at": _now()}

        overall_status = "completed"
        final_output = None
        trace_job_id = run_id

        for wave in waves:
            # Skip input nodes (already seeded) and output nodes (handled at end)
            runnable = [nid for nid in wave if node_map[nid].get("type") not in {"input"}]
            if not runnable:
                continue

            # Determine which edges are active (conditionals)
            active_nodes = set(runnable)
            for nid in list(runnable):
                # For conditional downstream, check incoming edge conditions
                incoming_edges = [e for e in edges if e.get("target") == nid]
                if incoming_edges and any(e.get("condition") for e in incoming_edges):
                    # node runs only if at least one incoming edge condition holds
                    ok = False
                    for e in incoming_edges:
                        src = e.get("source")
                        src_out = (node_results.get(src, {}).get("output") or {})
                        if _eval_condition(e, src_out if isinstance(src_out, dict) else {"value": src_out}):
                            ok = True
                            break
                    if not ok:
                        active_nodes.discard(nid)
                        node_results[nid] = {"status": "skipped", "output": None, "started_at": _now(), "completed_at": _now()}

            # Execute active nodes in parallel
            async def _run_node(nid: str):
                node = node_map[nid]
                ntype = node.get("type")
                started = _now()
                try:
                    if ntype == "output":
                        # Collect upstream outputs
                        up = _upstream_outputs(nid, edges, node_results)
                        node_results[nid] = {"status": "completed", "output": up, "started_at": started, "completed_at": _now()}
                        return
                    if ntype == "merge":
                        up = _upstream_outputs(nid, edges, node_results)
                        node_results[nid] = {"status": "completed", "output": up, "started_at": started, "completed_at": _now()}
                        return
                    if ntype == "conditional":
                        up = _upstream_outputs(nid, edges, node_results)
                        # conditional node just passes through; branching handled by edges
                        node_results[nid] = {"status": "completed", "output": up, "started_at": started, "completed_at": _now()}
                        return
                    if ntype == "tool":
                        # Force a single tool call via an agent-less execution: use runner with the tool's agent if specified
                        agent_name = node.get("agent_name") or "researcher"
                        tool_name = node.get("tool_name")
                        tool_args = node.get("config", {}).get("args", {})
                        # Merge upstream
                        up = _upstream_outputs(nid, edges, node_results)
                        merged_input = {**up, **tool_args}
                        # Run agent with delegation disabled
                        merged_input.setdefault("_allow_delegation", False)
                        merged_input.setdefault("stream", False)
                        result = await self.runner.run(merged_input, agent_name=agent_name, job_id=trace_job_id)
                        out = result.get("result", result)
                        st = "completed" if result.get("status") in ("success", "completed") else "failed"
                        node_results[nid] = {"status": st, "output": out, "error": result.get("error"), "started_at": started, "completed_at": _now()}
                        if st == "failed":
                            overall_status = "failed"
                        return
                    if ntype == "agent":
                        agent_name = node.get("agent_name")
                        up = _upstream_outputs(nid, edges, node_results)
                        cfg = node.get("config", {}) or {}
                        merged_input = {**up}
                        if cfg.get("prompt"):
                            merged_input.setdefault("query", cfg["prompt"])
                            merged_input.setdefault("prompt", cfg["prompt"])
                        merged_input["_allow_delegation"] = cfg.get("allow_delegation", False)
                        merged_input["stream"] = False
                        # model override via env not needed here
                        result = await self.runner.run(merged_input, agent_name=agent_name, job_id=trace_job_id)
                        out = result.get("result", result)
                        st = "completed" if result.get("status") in ("success", "completed") else "failed"
                        node_results[nid] = {"status": st, "output": out, "error": result.get("error"), "started_at": started, "completed_at": _now()}
                        if st == "failed":
                            overall_status = "failed"
                        return
                except Exception as exc:
                    node_results[nid] = {"status": "failed", "output": None, "error": str(exc), "started_at": started, "completed_at": _now()}
                    overall_status = "failed"

            await asyncio.gather(*[_run_node(nid) for nid in active_nodes], return_exceptions=True)

        # Determine final output: prefer "output" nodes, else last wave's nodes
        output_nodes = [n["id"] for n in nodes if n.get("type") == "output"]
        if output_nodes:
            final_output = node_results.get(output_nodes[-1], {}).get("output")
        else:
            last_wave = waves[-1] if waves else []
            if last_wave:
                final_output = node_results.get(last_wave[-1], {}).get("output")

        return {
            "status": overall_status,
            "outputs": final_output,
            "node_results": node_results,
            "trace_job_id": trace_job_id,
        }


def _now() -> str:
    return datetime.utcnow().isoformat() + "Z"
