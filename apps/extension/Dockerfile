FROM node:22-alpine AS builder

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.5 --activate

ARG WXT_API_URL=http://localhost:8787
ENV WXT_API_URL=$WXT_API_URL

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/extension/package.json apps/extension/package.json
COPY apps/extension/wxt.config.ts apps/extension/wxt.config.ts
COPY apps/extension/src apps/extension/src
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @bazaarlens/shared build
RUN pnpm --filter @bazaarlens/extension build
RUN pnpm --filter @bazaarlens/extension zip

CMD ["sh", "-c", "mkdir -p /artifacts && cp -R apps/extension/.output/* /artifacts/ && ls -la /artifacts"]
