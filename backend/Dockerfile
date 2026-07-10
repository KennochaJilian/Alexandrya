# syntax=docker/dockerfile:1

FROM node:22-alpine AS dependencies
WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
RUN npm ci --workspace backend --include-workspace-root=false

FROM dependencies AS build
WORKDIR /app

COPY backend/tsconfig.json backend/tsconfig.json
COPY backend/src backend/src
RUN npm run build --workspace backend

FROM node:22-alpine AS production-dependencies
WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
RUN npm ci --omit=dev --workspace backend --include-workspace-root=false

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=4000

WORKDIR /app

RUN addgroup -S alexandrya \
  && adduser -S alexandrya -G alexandrya \
  && mkdir -p /data/covers /library \
  && chown -R alexandrya:alexandrya /data /library

COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=production-dependencies /app/package.json ./package.json
COPY --from=production-dependencies /app/package-lock.json ./package-lock.json
COPY --from=production-dependencies /app/backend/package.json ./backend/package.json
COPY --from=build /app/backend/dist ./backend/dist

WORKDIR /app/backend

USER alexandrya
EXPOSE 4000

CMD ["node", "dist/server.js"]
