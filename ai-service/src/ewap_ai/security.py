"""Service-to-service authentication; end-user authorization stays in NestJS."""

import secrets

from fastapi import HTTPException, Security
from fastapi.security import APIKeyHeader

key_header = APIKeyHeader(name="X-EWAP-Service-Key", auto_error=False)


def service_auth(expected_key: str | None):
    if expected_key is not None and (
        not 32 <= len(expected_key) <= 512
        or not expected_key.isascii()
        or any(character.isspace() for character in expected_key)
    ):
        raise ValueError("AI_SERVICE_API_KEY must contain 32–512 ASCII characters without whitespace")

    def authenticate(supplied: str | None = Security(key_header)) -> None:
        if not expected_key:
            raise HTTPException(status_code=503, detail="Diagnostics authentication is not configured")
        if supplied is None or not secrets.compare_digest(
            supplied.encode("utf-8"), expected_key.encode("utf-8")
        ):
            raise HTTPException(status_code=401, detail="Invalid service credentials")

    return authenticate
