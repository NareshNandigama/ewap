from fastapi import APIRouter

from ..diagnostics import diagnose
from ..schemas import DiagnosticRequest, DiagnosticResponse

router = APIRouter(prefix="/v1/diagnostics")


@router.post("/workflow-run", response_model=DiagnosticResponse)
def workflow_run(request: DiagnosticRequest) -> DiagnosticResponse:
    return diagnose(request)
