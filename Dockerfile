FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
COPY shared/package.json shared/package.json
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY client ./client
COPY server ./server
COPY shared ./shared
COPY scripts ./scripts
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-alpine AS runtime
ARG GIT_SHA=local
ENV GIT_SHA=${GIT_SHA}
ENV NODE_ENV=production PORT=3000 LOGS_DIR=/tmp/space-arena-logs CLIENT_DIR=/app/client/dist
WORKDIR /app
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/server/dist ./server/dist
COPY --from=builder --chown=node:node /app/client/dist ./client/dist
COPY --from=builder --chown=node:node /app/package.json ./package.json
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/dist/index.mjs"]
