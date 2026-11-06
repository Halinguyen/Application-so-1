# Mirrors the company convention (WORKDIR /usr/src/app, ARG DEPLOY, deploy/${DEPLOY}/.env.example -> ./.env)
# so the same Jenkins shared library (VTVliveVplayNodeJSautodev) works unchanged.
#
# Debian-slim, NOT alpine: sharp ships prebuilt glibc binaries (musl needs extra
# packages/builds), and the tool runs `npm install` on cloned templates whose
# native deps are more reliable on glibc.
FROM node:22.15.1-bookworm-slim
WORKDIR /usr/src/app
ARG DEPLOY

# Runtime needs: git (fetch templates), ca-certificates (https to source.vtvlive.vn / npm registry).
# npm comes with the node image.
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# /data = PersistentVolume mount (templates, cache, clones, uploads, layouts).
# Owned by uid 1000 ("node"); in Kubernetes the Deployment sets fsGroup: 1000
# so the mounted volume stays writable by this user.
RUN mkdir -p /data /usr/src/app \
 && chown -R node:node /data /usr/src/app
USER node

# Dependency layer (cached while package files are unchanged)
COPY --chown=node:node package*.json ./
RUN npm ci

COPY --chown=node:node . .
COPY --chown=node:node deploy/${DEPLOY}/.env.example ./.env

RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "start"]
