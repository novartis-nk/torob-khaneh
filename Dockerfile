FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM python:3.13-alpine
WORKDIR /app
ENV HOST=0.0.0.0 PORT=4317
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY --from=build /app/dist ./dist
COPY --from=build /app/backend ./backend
COPY --from=build /app/data/offers.json ./data/offers.json
COPY --from=build /app/data/safar-catalog.json ./data/safar-catalog.json
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app
EXPOSE 4317
CMD ["python3", "-m", "backend.app"]
