"""Versioned HTTP contracts. Fields use camelCase to match the NestJS boundary."""

from typing import Annotated, Literal

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    model_validator,
)
from pydantic.alias_generators import to_camel

from .contracts import Identifier, Question, LogMessage, RunStatus, LogLevel, Contract
from .grounding import GroundingContext, GroundingResult


class ExecutionLog(Contract):
    id: Identifier
    level: LogLevel
    message: LogMessage
    created_at: AwareDatetime


class WorkflowRunEvidence(Contract):
    id: Identifier
    status: RunStatus
    logs: list[ExecutionLog] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def unique_log_ids(self) -> "WorkflowRunEvidence":
        ids = [log.id for log in self.logs]
        if len(ids) != len(set(ids)):
            raise ValueError("Log IDs must be unique within a run")
        return self


class DiagnosticRequest(Contract):
    # This is caller-supplied context, NOT proof of authorization. NestJS must
    # establish the tenant and fetch authorized evidence before calling Python.
    organization_id: Identifier
    question: Question
    workflow_run: WorkflowRunEvidence
    grounding: GroundingContext | None = None


class RootCauseAssessment(Contract):
    status: Literal["undetermined", "not_applicable"]
    explanation: str


class ModelFinding(BaseModel):
    model_config = ConfigDict(extra="forbid")
    hypothesis: Annotated[str, StringConstraints(strict=True, strip_whitespace=True, min_length=1, max_length=1000)]
    log_id: Identifier
    quote: Annotated[str, StringConstraints(strict=True, strip_whitespace=True, min_length=1, max_length=500)]


class ModelUsage(Contract):
    model: Identifier
    input_tokens: int = Field(ge=0, strict=True)
    output_tokens: int = Field(ge=0, strict=True)


class DiagnosticResponse(Contract):
    analysis_mode: Literal["deterministic", "llm"] = "deterministic"
    organization_id: Identifier
    workflow_run_id: Identifier
    execution_status: RunStatus
    summary: str
    evidence: list[ExecutionLog]
    root_cause: RootCauseAssessment
    limitations: list[str]
    next_steps: list[str]
    findings: list[ModelFinding] | None = None
    usage: ModelUsage | None = None
    grounding: GroundingResult | None = None


class HealthResponse(Contract):
    status: Literal["ok"] = "ok"
    service: Literal["ewap-ai-service"] = "ewap-ai-service"
    analysis_mode: Literal["deterministic", "llm"] = "deterministic"
