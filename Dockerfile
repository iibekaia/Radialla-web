FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY web/package.json web/package.json
COPY server/package.json server/package.json
RUN npm ci
COPY web web
RUN npm run build
FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY server server
COPY --from=build /app/server/node_modules server/node_modules
COPY --from=build /app/web/dist/web/browser web/dist/web/browser
COPY web/public/stations.json web/public/stations.json
USER node
EXPOSE 3000
CMD ["node", "server/index.mjs"]
