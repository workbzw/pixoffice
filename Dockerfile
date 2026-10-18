ARG NODE_IMAGE=node:24-bookworm-slim
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY . .
RUN npm ci && npm run build:full && npm prune --omit=dev

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/packages/protocol ./packages/protocol
COPY --from=build --chown=node:node /app/packages/runtime ./packages/runtime
COPY --from=build --chown=node:node /app/packages/scene-office ./packages/scene-office
COPY --from=build --chown=node:node /app/server/dist ./server/dist
COPY --from=build --chown=node:node /app/dist ./dist
USER node
RUN node --input-type=module -e "const { createPixOfficeServer } = await import('./server/dist/app.js'); const app = await createPixOfficeServer({ staticRoot: './dist' }); await app.close()"
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/dist/index.js"]
