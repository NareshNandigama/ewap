-- Run with a lab role in a dedicated, empty database.
-- Replace EWAP_LEARNING_WH below with your dedicated lab warehouse name.
CREATE SCHEMA IF NOT EXISTS EWAP_LEARNING;
USE SCHEMA EWAP_LEARNING;

CREATE TABLE IF NOT EXISTS RAW_WORKFLOW_EVENTS (
    EVENT_ID VARCHAR PRIMARY KEY,
    WORKFLOW_NAME VARCHAR NOT NULL,
    STATUS VARCHAR NOT NULL,
    OCCURRED_AT TIMESTAMP_NTZ NOT NULL
);

MERGE INTO RAW_WORKFLOW_EVENTS AS target
USING (
    SELECT
        column1 AS event_id,
        column2 AS workflow_name,
        column3 AS status,
        TO_TIMESTAMP_NTZ(column4) AS occurred_at
    FROM VALUES
        ('evt-001', 'build', 'SUCCESS', '2026-11-17 09:00:00'),
        ('evt-002', 'build', 'FAILED', '2026-11-17 10:00:00'),
        ('evt-003', 'deploy', 'FAILED', '2026-11-17 11:00:00'),
        ('evt-004', 'build', 'SUCCESS', '2026-11-18 09:00:00')
) AS fixture
ON target.event_id = fixture.event_id
WHEN NOT MATCHED THEN
    INSERT (event_id, workflow_name, status, occurred_at)
    VALUES (fixture.event_id, fixture.workflow_name, fixture.status, fixture.occurred_at);

CREATE VIEW IF NOT EXISTS WORKFLOW_DAILY AS
SELECT
    CAST(occurred_at AS DATE) AS event_day,
    workflow_name,
    COUNT(*) AS event_count,
    SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS failure_count
FROM RAW_WORKFLOW_EVENTS
GROUP BY CAST(occurred_at AS DATE), workflow_name;

CREATE DYNAMIC TABLE IF NOT EXISTS DT_WORKFLOW_DAILY
    TARGET_LAG = '1 hour'
    WAREHOUSE = EWAP_LEARNING_WH
    REFRESH_MODE = FULL
    INITIALIZE = ON_CREATE
AS
SELECT event_day, workflow_name, event_count, failure_count
FROM WORKFLOW_DAILY;

CREATE SEMANTIC VIEW IF NOT EXISTS WORKFLOW_ANALYST
    TABLES (daily AS WORKFLOW_DAILY PRIMARY KEY (event_day, workflow_name))
    DIMENSIONS (
        daily.event_date AS daily.event_day,
        daily.workflow AS daily.workflow_name
    )
    METRICS (
        daily.events AS SUM(daily.event_count),
        daily.failures AS SUM(daily.failure_count)
    )
    COMMENT = 'Synthetic EWAP workflow event counts for Cortex Analyst practice';

WITH workflow_history AS (
    SELECT
        event_day,
        workflow_name,
        event_count,
        failure_count,
        SUM(failure_count) OVER (
            PARTITION BY workflow_name
            ORDER BY event_day
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS cumulative_failures
    FROM WORKFLOW_DAILY
)
SELECT *
FROM workflow_history
ORDER BY event_day, workflow_name;

SELECT COUNT(*) AS daily_rows, SUM(event_count) AS events, SUM(failure_count) AS failures
FROM DT_WORKFLOW_DAILY;

ALTER DYNAMIC TABLE DT_WORKFLOW_DAILY SUSPEND;
