FROM node:22-alpine AS builder
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY server/ ./server/
COPY shared/ ./shared/
RUN mkdir -p data/avatars data/emojis

EXPOSE 3001
ENV NODE_ENV=production
CMD ["node_modules/.bin/tsx", "server/index.ts"]
