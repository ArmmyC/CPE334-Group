# syntax=docker/dockerfile:1
# One image for the API and the built SPA (SDS 10). Build context is the repository root,
# because `server` imports the `@cpe334-group/shared` workspace package.

FROM node:24-bookworm-slim AS build
# Prisma needs OpenSSL at generate and run time.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# Manifests first, so the dependency layer is reused until a package file changes.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --ignore-scripts
COPY . .
# `prepare` builds shared and generates the Prisma client, then the three workspaces build.
RUN npm run prepare && npm run build

FROM node:24-bookworm-slim AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=8080
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
# Runtime dependencies of shared and server only. `prisma` is one of them, because the
# migration job runs `prisma migrate deploy` from this image.
RUN npm ci --omit=dev --ignore-scripts --workspace shared --workspace server \
 && npm cache clean --force
COPY --from=build /app/shared/dist shared/dist
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/server/prisma server/prisma
COPY --from=build /app/client/dist client/dist
# --ignore-scripts skipped the Prisma postinstall, so fetch its engines and generate the
# client here, while the build still has network access. The engines script is an internal
# Prisma path that the Prisma 7 upgrade may move; the Docker image CI job catches that.
RUN node node_modules/@prisma/engines/scripts/postinstall.js \
 && node node_modules/prisma/build/index.js generate --schema server/prisma/schema.prisma
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server/dist/server.js"]
