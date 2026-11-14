import os

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .routes import diagnostics, health
from .body_limit import DiagnosticBodyLimit
from .security import service_auth


def create_app() -> FastAPI:
    app = FastAPI(title="EWAP AI Diagnostics", version="0.1.0")
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
