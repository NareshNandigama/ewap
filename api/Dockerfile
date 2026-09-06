# -----------------------------
# Stage 1: Build
# -----------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Enable Yarn
RUN corepack enable

# Copy dependency files first
COPY package.json yarn.lock ./

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy application source
COPY . .

# Prisma config requires DATABASE_URL during build.
# This is only used for Prisma Client generation.
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"

# Generate Prisma client
RUN yarn prisma generate

# Build NestJS application
RUN yarn build


# -----------------------------
# Stage 2: Production
# -----------------------------
FROM node:22-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

RUN corepack enable

# Copy dependency files
COPY package.json yarn.lock ./

# Install production dependencies only
RUN yarn install --frozen-lockfile --production

# Copy compiled application
COPY --from=builder /app/dist ./dist

# Copy generated Prisma client
COPY --from=builder /app/src/generated ./src/generated

# Copy Prisma schema and configuration
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

EXPOSE 3000

CMD ["node", "dist/main.js"]