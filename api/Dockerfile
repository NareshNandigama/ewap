# -----------------------------
# Stage 1: Build
# -----------------------------
FROM node:24-alpine AS builder

WORKDIR /app

RUN corepack enable

COPY package.json yarn.lock ./

RUN yarn install --frozen-lockfile && yarn cache clean

COPY . .

ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"

RUN yarn prisma generate

RUN yarn build


# -----------------------------
# Stage 2: Production
# -----------------------------
FROM node:24-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

RUN corepack enable

COPY package.json yarn.lock ./

RUN yarn install --frozen-lockfile --production=true \
    && yarn cache clean \
    && rm -rf node_modules/typescript

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

USER node

EXPOSE 3000

CMD ["node", "dist/main.js"]