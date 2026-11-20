# Snowflake workflow analytics lab

This lab uses four synthetic workflow events and runs independently of EWAP.
Use a dedicated Snowflake lab database and warehouse. The script creates objects
in the database selected in your session. Dynamic table initialization uses
warehouse compute.

1. In a worksheet, select a lab role, dedicated database, and lab warehouse.
   Replace `EWAP_LEARNING_WH` in the script if your warehouse has a different name.
2. Run [workflow-analytics.sql](workflow-analytics.sql). The history query should
   return three rows. For `build`, cumulative failures should be 1 on both days.
   The dynamic table query should return 3 daily rows, 4 events, and 2 failures.
3. Verify the dynamic table is suspended with
   `SHOW DYNAMIC TABLES LIKE 'DT_WORKFLOW_DAILY'`. If the worksheet stops before
   the last statement, run `ALTER DYNAMIC TABLE DT_WORKFLOW_DAILY SUSPEND`.
4. Open Cortex Analyst with the `EWAP_LEARNING.WORKFLOW_ANALYST` semantic view.
   Ask “How many build workflow events failed?” Check that the generated query
   filters to `build` and returns 1. This requires Cortex Analyst access.

Snowflake execution and Cortex Analyst verification require a lab account.
[Dynamic tables](https://docs.snowflake.com/en/user-guide/dynamic-tables/create) ·
[Semantic view DDL](https://docs.snowflake.com/en/sql-reference/sql/create-semantic-view)
