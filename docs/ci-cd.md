# EWAP CI and deployment images

EWAP uses GitHub Actions to verify changes and publish deployable container
images. The deployment image manifest identifies the exact images a staging
or production environment should run.

## Follow a CI run

Open **Actions → CI** on GitHub. CI runs on pull requests and pushes to
`main`. You can also run it manually.

1. The JavaScript matrix runs linting, tests, and builds for the NestJS API,
   worker, and Next.js app. It generates Prisma clients on the fresh runners
   and exercises MCP stdio and frontend streaming.
2. The Python job installs runtime dependencies from the lock file, tests
   FastAPI, and builds the Python wheel and source distribution.
3. The Compose job starts the isolated local stack. Its smoke test covers
   registration, tenant boundaries, dispatch and worker execution, authenticated
   WebSockets, PostgreSQL TLS, deterministic diagnostics, and runbook search.
   It uses synthetic data and can run without cloud or model credentials.

To learn the pipeline, open a small pull request, inspect the individual job
logs, and follow a change from a failing check to a passing run. Configure
**EWAP CI passed** as a required status check on your protected default branch
when the first hosted run passes.

## Publish a release candidate

After the changes land on the default branch, open **Actions → Publish
deployment images → Run workflow** and select that branch. Publication reruns
CI for the selected commit before it pushes images. GitHub's repository token
only needs package write access in the publishing jobs. Each image gets a
commit tag, and the workflow summary and **deployment-images** artifact
contain immutable SHA-256 image references for the web, API, worker, Python,
and Prisma migration images.

If the browser should receive live workflow updates, set the repository
Actions variable `NEXT_PUBLIC_WEBSOCKET_URL` to the browser-reachable
Socket.IO URL before publishing. Next.js embeds that value at build time.
Set the web container's private upstream `EWAP_API_URL` at runtime.
A new public socket URL requires a new web build.

## Deploy the image set

Use the manifest from a successful publish run as the deployment input.
Provision the target environment and its PostgreSQL/pgvector, RabbitMQ, and
Redis dependencies. Configure runtime secrets using the target's secret
manager and keep Python and the worker on private network paths. Point the
browser's public URL at your frontend and route Socket.IO traffic to the API.
See the [API runtime contract](api-configuration.md) for TLS and configuration
requirements.

| Target | How to consume the release |
| --- | --- |
| AWS ECS | Reference the images by digest in ECS task definitions. For private GHCR packages, configure ECS private registry authentication or mirror the images into ECR and use the destination digests. |
| Azure Container Apps | Mirror the images into ACR and configure managed identity image pulls. Deploy the web, API, worker, and Python services from the destination digests. |

Run the migration image once against the target database with its runtime
`DATABASE_URL` set explicitly and command override `yarn prisma migrate deploy`.
Verify that job succeeds before updating services. Check API readiness,
frontend login, workflow dispatch, and diagnostics after the rollout. Keep
the previous image manifest for rollback and check schema compatibility
before reverting applications.

The current workflows stop at publishing. A cloud rollout job should use
a GitHub environment and a narrowly scoped cloud identity once the account,
region, registry, and deployment targets are selected. GitHub Actions
supports OIDC for short-lived AWS and Azure access.

[GitHub image publishing](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images) · [AWS OIDC](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws) · [Azure OIDC](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-azure) · [ECS registry authentication](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/private-auth.html) · [Azure managed identity pulls](https://learn.microsoft.com/en-us/azure/container-apps/managed-identity-image-pull)
