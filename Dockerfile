# syntax=docker/dockerfile:1

FROM node:22-alpine AS builder
# better-sqlite3 needs to be compiled against musl on alpine
RUN apk add --no-cache python3 make g++
# Enable pnpm via corepack (bundled with Node)
RUN corepack enable
WORKDIR /app
# Install deps first for better layer caching; build scripts approved in pnpm-workspace.yaml
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
# Copy full node_modules (includes devDep tsx used to run the server source)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY server/ ./server/
COPY shared/ ./shared/

EXPOSE 3001
CMD ["node_modules/.bin/tsx", "server/index.ts"]
