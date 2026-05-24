FROM node:20-alpine

RUN apk add --no-cache postgresql-client

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm install

RUN mkdir -p uploads && chown -R node:node /app

COPY src/ ./src/

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "src/index.js"]