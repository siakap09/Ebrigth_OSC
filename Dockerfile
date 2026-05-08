FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache openssl && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown nodejs:nodejs /app
USER nodejs

COPY --chown=nodejs:nodejs package*.json ./
RUN npm ci

COPY --chown=nodejs:nodejs prisma ./prisma/
RUN npx prisma generate

COPY --chown=nodejs:nodejs . .

# Build-time env.
#
# SKIP_ENV_VALIDATION=1 short-circuits the lib/env.ts validator — none of
# the checked secrets are inlined into the bundle (no NEXT_PUBLIC_*), so
# the build doesn't need real values. The runtime container still
# validates them at startup via env_file.
#
# DATABASE_URL is set to a placeholder because lib/prisma.ts reads
# process.env.DATABASE_URL at module top and throws if it's missing.
# Prisma doesn't open a connection during `next build`, but it does parse
# the URL when the client is constructed. Real DATABASE_URL is injected
# at container start.
#
# The previous ARG plumbing (declared before FROM, referenced as ${...} in
# this RUN) was a no-op — ARGs above FROM aren't visible inside the build
# stage, so values were always empty. Removed to avoid confusion.
# NODE_OPTIONS gives Node 4 GB of heap. Default is ~1.4 GB on 64-bit Linux,
# which `next build` can blow past once Recharts + the rest of the app are
# in the bundle. Without this the build OOM-loops with webpack "Retrying 1/3"
# messages and either takes 40+ minutes or never finishes.
RUN SKIP_ENV_VALIDATION=1 \
    DATABASE_URL=postgres://buildtime:buildtime@127.0.0.1:5432/buildtime \
    NODE_OPTIONS=--max-old-space-size=4096 \
    npm run build

EXPOSE 3000
CMD ["npm", "start"]
