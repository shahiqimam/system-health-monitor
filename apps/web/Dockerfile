# syntax=docker/dockerfile:1
# Build context is the repository root (npm workspaces).
FROM node:22-alpine AS builder
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY apps/web apps/web
# NEXT_PUBLIC_* values are inlined at build time.
ARG NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build --workspace apps/web

FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache wget
COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
