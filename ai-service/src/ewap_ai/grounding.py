"""Extractive support checking: excerpts are observations, never causal proof."""
import hashlib
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator
from .contracts import Contract, Identifier

Quote = Annotated[str, StringConstraints(strict=True, strip_whitespace=True, min_length=8, max_length=500)]
Hash = Annotated[str, StringConstraints(pattern=r"^[a-f0-9]{64}$")]


class Passage(Contract):
    chunk_id: Identifier
    document_id: Identifier
    source_key: Identifier
    version: int = Field(strict=True, ge=1)
    document_hash: Hash
    chunk_hash: Hash
    content: Annotated[str, StringConstraints(strict=True, min_length=1, max_length=2000)]

    @model_validator(mode="after")
    def content_hash_matches(self):
        if hashlib.sha256(self.content.encode()).hexdigest() != self.chunk_hash:
            raise ValueError("Passage content hash mismatch")
        return self


class GroundingContext(Contract):
    mode: Literal["keyword", "vector", "hybrid"]
    passages: list[Passage] = Field(max_length=5)

    @model_validator(mode="after")
    def unique_passages(self):
        ids = [p.chunk_id for p in self.passages]
        if len(ids) != len(set(ids)):
            raise ValueError("Duplicate passage IDs")
        return self


class ExtractiveFinding(BaseModel):
    model_config = ConfigDict(extra="forbid")
    claim: Quote
    log_id: Identifier
    log_quote: Quote
    passage_id: Identifier
    passage_quote: Quote


class GroundedOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    observations: list[ExtractiveFinding] = Field(max_length=5)


class GroundingResult(Contract):
    status: Literal["supported_observations", "insufficient_evidence"]
    observations: list[ExtractiveFinding] = Field(max_length=5)
    # Echo the immutable request snapshot, not model-generated provenance.
    passages: list[Passage] = Field(max_length=5)


def supported(request, candidates):
    logs = {log.id: log for log in sorted(request.workflow_run.logs, key=lambda log: (log.created_at, log.id))[-20:]}
    passages = {p.chunk_id: p for p in request.grounding.passages}
    accepted = []
    for item in candidates:
        log, passage = logs.get(item.log_id), passages.get(item.passage_id)
        # Free-form causal paraphrases are never promoted to supported claims.
        if (log is not None and log.level in {"WARN", "ERROR"} and passage is not None
                and item.claim == item.log_quote and item.log_quote in log.message
                and item.passage_quote in passage.content and item not in accepted):
            accepted.append(item)
    return GroundingResult(status="supported_observations" if accepted else "insufficient_evidence",
                           observations=accepted, passages=request.grounding.passages)
