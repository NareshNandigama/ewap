"""Explicit offline or paid-provider evaluation. Outputs contain IDs/metrics, never evidence."""
import argparse
import asyncio
import hashlib
import json
import math
import statistics
import time
from pathlib import Path

import httpx
from .model_diagnostics import ModelDiagnostics, ModelSettings, ModelFailure
from .schemas import DiagnosticRequest


def make_request(case):
    passages = []
    for index, text in enumerate(case["sources"]):
        digest = hashlib.sha256(text.encode()).hexdigest()
        passages.append({"chunkId": f"chunk-{index}", "documentId": f"document-{index}", "sourceKey": f"source-{index}",
                         "version": case.get("version", 1), "documentHash": digest, "chunkHash": digest, "content": text})
    return DiagnosticRequest.model_validate({"organizationId": "evaluation-tenant", "question": case["question"],
        "workflowRun": {"id": "evaluation-run", "status": case.get("status", "FAILED"), "logs": [
            {"id": "log-1", "level": case.get("level", "ERROR"), "message": case["log"], "createdAt": "2026-11-17T10:00:00Z"}] if case.get("log") else []},
        "grounding": {"mode": "keyword", "passages": passages}})


async def evaluate(cases, provider="mock", settings=None, input_price=None, output_price=None):
    rows = []
    for case in cases:
        def handler(_request):
            return httpx.Response(200, json={"choices": [{"finish_reason": "stop", "message": {"content": json.dumps({"observations": case["candidateObservations"]})}}],
                "usage": {"prompt_tokens": 100, "completion_tokens": 40}})
        model = ModelDiagnostics(settings or ModelSettings(mode="llm", api_key="mock-only", model="mock-only"),
                                 httpx.MockTransport(handler) if provider == "mock" else None)
        request = make_request(case)
        start = time.perf_counter()
        row = {"id": case["id"], "split": case["split"], "category": case["category"]}
        try:
            report = await model.run(request)
            grounded = report.grounding
            observed = bool(grounded.observations)
            row.update({"passed": observed == case["expectObservation"], "status": grounded.status,
                "acceptedObservations": len(grounded.observations), "inputTokens": report.usage.input_tokens if report.usage else 0,
                "outputTokens": report.usage.output_tokens if report.usage else 0,
                "rootCauseUndetermined": report.root_cause.status in {"undetermined", "not_applicable"}})
            if input_price is not None and output_price is not None and provider != "mock":
                row["estimatedUsd"] = (row["inputTokens"] * input_price + row["outputTokens"] * output_price) / 1_000_000
        except ModelFailure as error:
            row.update({"passed": False, "status": "unavailable", "failureReason": error.reason})
        except Exception:
            row.update({"passed": False, "status": "unavailable", "failureReason": "evaluation_error"})
        row["elapsedMs"] = round((time.perf_counter() - start) * 1000, 3)
        rows.append(row)
    timings = sorted(row["elapsedMs"] for row in rows)
    summary = {"usageComplete": all(r["status"] != "unavailable" for r in rows), "bySplit": {split: {"passed": sum(r["passed"] for r in rows if r["split"] == split),
                "total": sum(r["split"] == split for r in rows)} for split in {r["split"] for r in rows}},
               "latencyMs": {"p50": statistics.median(timings), "p95": timings[max(0, math.ceil(len(timings) * .95) - 1)]},
               "inputTokens": sum(r.get("inputTokens", 0) for r in rows), "outputTokens": sum(r.get("outputTokens", 0) for r in rows)}
    return {"summary": summary, "provider": provider, "scope": "Contract evaluation with scripted outputs; not model quality" if provider == "mock" else "Live provider evaluation; successful-call usage, estimated cost excludes failed/retried calls",
            "cases": rows, "passed": sum(row["passed"] for row in rows), "total": len(rows)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cases", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--split", choices=["development", "heldout", "all"], default="heldout")
    parser.add_argument("--provider", choices=["mock", "openai"], default="mock")
    parser.add_argument("--input-usd-per-million", type=float)
    parser.add_argument("--output-usd-per-million", type=float)
    args = parser.parse_args()
    if any(p is not None and (not math.isfinite(p) or p < 0) for p in [args.input_usd_per_million, args.output_usd_per_million]):
        parser.error("Prices must be finite and nonnegative")
    if (args.input_usd_per_million is None) != (args.output_usd_per_million is None):
        parser.error("Supply both input and output prices, or neither")
    cases = json.loads(args.cases.read_text())
    cases = [c for c in cases if args.split == "all" or c["split"] == args.split]
    if not cases:
        parser.error("No evaluation cases selected")
    settings = None
    if args.provider == "openai":
        settings = ModelSettings.from_env()
        if settings.mode != "llm":
            parser.error("Live evaluation requires AI_ANALYSIS_MODE=llm, AI_MODEL, and OPENAI_API_KEY; it can incur costs")
    result = asyncio.run(evaluate(cases, args.provider, settings, args.input_usd_per_million, args.output_usd_per_million))
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    raise SystemExit(0 if result["passed"] == result["total"] else 1)


if __name__ == "__main__":
    main()
