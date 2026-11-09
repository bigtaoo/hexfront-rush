# Hexfront Rush's replay collector (server/collect.ts and the modules it loads, laid out under
# app/ by `npm run pack:collector`). No dependencies: Node runs the TypeScript as is (type
# stripping, on by default since Node 22.18). The image is pinned to one Node release, the one
# Potion Siege's collector runs on the same box; a rebuild does not pick up a new one unasked.
FROM node:22.23.4-alpine
WORKDIR /app
COPY app/ ./
# compose bind-mounts ./data here; without it, node could not create the directory itself
RUN mkdir -p /data/replays && chown -R node:node /data
USER node
ENV NODE_ENV=production PORT=8787 REPLAY_DIR=/data/replays
EXPOSE 8787
CMD ["node", "--disable-warning=ExperimentalWarning", "server/collect.ts"]
