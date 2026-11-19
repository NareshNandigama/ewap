# Root build context retains canonical schema ownership and the shared sync check.
FROM node:24-alpine AS builder
WORKDIR /app/worker
RUN corepack enable
COPY worker/package.json worker/yarn.lock ./
RUN yarn install --frozen-lockfile && yarn cache clean
COPY scripts/schema-sync.mjs /app/scripts/schema-sync.mjs
COPY api/prisma/schema.prisma /app/api/prisma/schema.prisma
COPY api/src/prisma/database-config.ts /app/api/src/prisma/database-config.ts
COPY worker/ ./
ENV DATABASE_URL=postgresql://unused:unused@localhost:5432/unused
RUN yarn prisma generate && yarn build

FROM node:24-alpine AS runtime
WORKDIR /app/worker
ENV NODE_ENV=production
RUN corepack enable
COPY worker/package.json worker/yarn.lock ./
RUN yarn install --frozen-lockfile --production=true && yarn cache clean
COPY --from=builder --chown=node:node /app/worker/dist ./dist
USER node
CMD ["node", "dist/main.js"]
