from fastapi import APIRouter, Request

from ..schemas import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health(request: Request) -> HealthResponse:
    """Process health only; does not probe databases or LLM providers."""
    return HealthResponse(analysisMode="llm" if request.app.state.model_diagnostics else "deterministic")
