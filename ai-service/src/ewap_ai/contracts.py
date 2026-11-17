from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, StringConstraints
from pydantic.alias_generators import to_camel

Identifier = Annotated[
    str, StringConstraints(strict=True, strip_whitespace=True, min_length=1, max_length=200)
]
Question = Annotated[
    str, StringConstraints(strict=True, strip_whitespace=True, min_length=1, max_length=2000)
]
LogMessage = Annotated[
    str, StringConstraints(strict=True, strip_whitespace=True, min_length=1, max_length=2000)
]
RunStatus = Literal["PENDING", "RUNNING", "SUCCESS", "FAILED", "CANCELLED"]
LogLevel = Literal["INFO", "WARN", "ERROR", "SUCCESS"]


class Contract(BaseModel):
    model_config = ConfigDict(
        extra="forbid", alias_generator=to_camel, serialize_by_alias=True
    )


