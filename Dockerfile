# Simple production container: Node serves API and static frontend
FROM node:20-bullseye-slim
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY . .
ENV PORT=8080
EXPOSE 8080
CMD ["node","server.js"]
