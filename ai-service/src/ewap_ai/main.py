import os

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .routes import diagnostics, health
from .body_limit import DiagnosticBodyLimit
from .security import service_auth
from .model_diagnostics import ModelDiagnostics, ModelSettings


def create_app(model_diagnostics=None) -> FastAPI:
    app = FastAPI(title="EWAP AI Diagnostics", version="0.1.0")
    settings = ModelSettings.from_env()
    app.state.model_diagnostics = model_diagnostics or (ModelDiagnostics(settings) if settings.mode == "llm" else None)
    authenticate = service_auth(os.environ.get("AI_SERVICE_API_KEY"))
    app.add_middleware(DiagnosticBodyLimit)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_request: Request, exc: RequestValidationError) -> JSONResponse:
        # Do not echo submitted logs/questions in validation failures.
        return JSONResponse(status_code=422, content={
            "detail": [
                {"loc": error["loc"], "type": error["type"], "msg": error["msg"]}
                for error in exc.errors()
            ]
        })

    app.include_router(health.router)
    app.include_router(diagnostics.router, dependencies=[Depends(authenticate)])
    return app


app = create_app()
