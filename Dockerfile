# StoreOps API — local container deployment target.
#
# Multi-stage: the build stage compiles TypeScript and runs the full harness
# gate, so an image cannot be produced from code that violates the project
# standards. That is deliberate — the gate belongs in the image build, not
# only on a developer's machine.

# ---------- build ----------
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json vitest.config.ts ./
COPY src ./src
COPY tests ./tests
COPY .harness ./.harness

# Standards gate + typecheck + tests + coverage thresholds.
# Remove this line only if you also intend to remove the governance.
RUN npm run harness:verify

RUN npm run build

# ---------- runtime ----------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=build /app/dist ./dist

# Run unprivileged.
USER node

ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/src/main.js"]
