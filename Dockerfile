# Next.js app image. Assumes prisma/schema.prisma has been switched to the
# "postgresql" provider before building for this compose stack — see
# docs/DEPLOYMENT.md.
FROM node:22-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app/public ./public
COPY --from=build /app/.next ./.next
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/app/generated ./app/generated

EXPOSE 3000
CMD ["npx", "next", "start"]
