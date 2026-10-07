# Build from the repository root: docker build -f backend/Dockerfile .
FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN npm ci --workspace backend --include-workspace-root=false

COPY backend ./backend
ENV DB_PROVIDER=postgresql
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/placeholder
RUN npm run prisma:generate --workspace backend
RUN npm run build --workspace backend

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV DB_PROVIDER=postgresql
ENV PORT=4000

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/backend/package.json ./backend/package.json
COPY --from=build /app/frontend/package.json ./frontend/package.json
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/prisma ./backend/prisma
COPY --from=build /app/backend/scripts ./backend/scripts
COPY --from=build /app/node_modules ./node_modules
# npm keeps some workspace-only dependencies under backend/node_modules.
# Copy them too; otherwise runtime imports such as @hapi/boom fail on Railway.
COPY --from=build /app/backend/node_modules ./backend/node_modules
# Fail the image build if a workspace-only runtime dependency was not copied.
RUN cd /app/backend && node --input-type=module -e "await import('@hapi/boom')"

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "npm run prisma:generate --workspace backend && npm run prisma:db:push --workspace backend && npm run start --workspace backend"]
