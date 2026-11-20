import asyncio
import json
import logging
from contextlib import suppress
from time import perf_counter

from fastapi import APIRouter, HTTPException, Request

from ..diagnostics import diagnose
from ..model_diagnostics import ModelFailure
from ..schemas import DiagnosticRequest, DiagnosticResponse

router = APIRouter(prefix="/v1/diagnostics")
logger = logging.getLogger("uvicorn.error").getChild("diagnostics")


def log_outcome(
    started: float,
    mode: str,
    outcome: str,
    *,
    reason: str | None = None,
    report: DiagnosticResponse | None = None,
) -> None:
    event: dict[str, str | int | float] = {
        "event": "workflow_diagnostics",
        "mode": mode,
        "outcome": outcome,
        "durationMs": round((perf_counter() - started) * 1000, 1),
    }
    if reason is not None:
        event["reason"] = reason
    if report is not None and report.grounding is not None:
        event["groundingStatus"] = report.grounding.status
    if report is not None and report.usage is not None:
        event["inputTokens"] = report.usage.input_tokens
        event["outputTokens"] = report.usage.output_tokens
    level = logging.WARNING if outcome == "failed" else logging.INFO
    logger.log(level, "%s", json.dumps(event))


@router.post("/workflow-run", response_model=DiagnosticResponse, response_model_exclude_none=True)
async def workflow_run(request: DiagnosticRequest, http: Request) -> DiagnosticResponse:
    started = perf_counter()
    engine = http.app.state.model_diagnostics
    if engine is None:
        report = diagnose(request)
        log_outcome(started, "deterministic", "completed", report=report)
        return report

    async def disconnected():
        while not await http.is_disconnected():
            await asyncio.sleep(0.05)

    work = asyncio.create_task(engine.run(request))
    disconnect = asyncio.create_task(disconnected())
    try:
        done, _ = await asyncio.wait({work, disconnect}, return_when=asyncio.FIRST_COMPLETED)
        if disconnect in done:
            log_outcome(started, "llm", "cancelled")
            raise HTTPException(499, "Client disconnected")
        report = await work
        log_outcome(started, "llm", "completed", report=report)
        return report
    except asyncio.CancelledError:
        log_outcome(started, "llm", "cancelled")
        raise
    except ModelFailure as error:
        log_outcome(started, "llm", "failed", reason=error.reason)
        raise HTTPException(503, "Model diagnostics unavailable") from None
    finally:
        for task in (work, disconnect):
            task.cancel()
        for task in (work, disconnect):
            with suppress(asyncio.CancelledError, ModelFailure):
                await task
