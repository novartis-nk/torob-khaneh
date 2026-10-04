FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4317
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/data/offers.json ./data/offers.json
COPY --from=build /app/package.json ./package.json
RUN chown -R node:node /app
USER node
EXPOSE 4317
CMD ["node", "server/index.mjs"]
