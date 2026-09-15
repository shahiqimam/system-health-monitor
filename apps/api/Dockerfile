# syntax=docker/dockerfile:1
# Build context is the repository root (npm workspaces).
FROM node:22-alpine AS builder
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY apps/api apps/api
RUN npm run build --workspace apps/api

FROM node:22-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --workspace apps/api --include-workspace-root

FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /repo/apps/api
RUN apk add --no-cache wget
COPY --from=deps /repo/node_modules /repo/node_modules
COPY --from=deps /repo/package.json /repo/package.json
COPY apps/api/package.json ./package.json
COPY --from=builder /repo/apps/api/dist ./dist
USER node
EXPOSE 3001
CMD ["node", "dist/main.js"]
