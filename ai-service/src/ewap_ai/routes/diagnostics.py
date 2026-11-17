import asyncio
from contextlib import suppress

from fastapi import APIRouter, HTTPException, Request

from ..diagnostics import diagnose
from ..model_diagnostics import ModelFailure
from ..schemas import DiagnosticRequest, DiagnosticResponse

router = APIRouter(prefix="/v1/diagnostics")


@router.post("/workflow-run", response_model=DiagnosticResponse, response_model_exclude_none=True)
async def workflow_run(request: DiagnosticRequest, http: Request) -> DiagnosticResponse:
    engine = http.app.state.model_diagnostics
    if engine is None:
        return diagnose(request)

    async def disconnected():
        while not await http.is_disconnected():
            await asyncio.sleep(0.05)

    work = asyncio.create_task(engine.run(request))
    disconnect = asyncio.create_task(disconnected())
    try:
        done, _ = await asyncio.wait({work, disconnect}, return_when=asyncio.FIRST_COMPLETED)
        if disconnect in done:
            raise HTTPException(499, "Client disconnected")
        return await work
    except ModelFailure:
        raise HTTPException(503, "Model diagnostics unavailable") from None
    finally:
        for task in (work, disconnect):
            task.cancel()
        for task in (work, disconnect):
            with suppress(asyncio.CancelledError, ModelFailure):
                await task
