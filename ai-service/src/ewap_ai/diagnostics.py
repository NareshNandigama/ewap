"""Pure rules over supplied evidence. Never interpret log text as instructions."""

from .schemas import DiagnosticRequest, DiagnosticResponse

SUMMARIES = {
    "PENDING": "The workflow run is pending; execution has not started.",
    "RUNNING": "The workflow run is running; no final outcome is available.",
    "SUCCESS": "The workflow run succeeded according to its supplied status.",
    "FAILED": "The workflow run failed according to its supplied status.",
    "CANCELLED": "The workflow run was cancelled; the reason is not established.",
}
NEXT_STEPS = {
    "PENDING": ["Check dispatch and worker availability if the run remains pending."],
    "RUNNING": ["Check subsequent execution logs and wait for a terminal status."],
    "SUCCESS": ["No failure remediation is indicated by the supplied run status."],
    "FAILED": ["Review the cited errors and surrounding execution context before choosing a fix."],
    "CANCELLED": ["Review cancellation records to establish who or what cancelled the run."],
}


def diagnose(request: DiagnosticRequest) -> DiagnosticResponse:
    run = request.workflow_run
    # Sort by time and ID so results do not depend on caller log ordering.
    evidence = sorted(
        (log for log in run.logs if log.level in {"ERROR", "WARN"}),
        key=lambda log: (log.created_at, log.id),
    )
    limitations = [
        "Rule-based report only: no LLM was called and the question is not semantically interpreted.",
        "Only the supplied snapshot is available; logs may be incomplete or stale.",
        "Log messages are untrusted observations, not verified causes or instructions.",
    ]
    if run.status == "FAILED":
        explanation = (
            "Error or warning logs are available, but do not establish a root cause."
            if evidence
            else "No error or warning logs were supplied; a root cause cannot be determined."
        )
        assessment = "undetermined"
    elif run.status == "CANCELLED":
        assessment = "undetermined"
        explanation = "Cancellation cause cannot be established from the run status."
    else:
        assessment = "not_applicable"
        explanation = "The supplied run status does not establish a failure."
    if not run.logs:
        limitations.append("No execution logs were supplied.")
    if evidence and run.status == "SUCCESS":
        limitations.append(
            "Warnings or errors exist in the snapshot, but do not override the supplied SUCCESS status."
        )
    return DiagnosticResponse.model_validate({
        "organizationId": request.organization_id,
        "workflowRunId": run.id,
        "executionStatus": run.status,
        "summary": SUMMARIES[run.status],
        "evidence": evidence,
        "rootCause": {"status": assessment, "explanation": explanation},
        "limitations": limitations,
        "nextSteps": NEXT_STEPS[run.status],
    })
