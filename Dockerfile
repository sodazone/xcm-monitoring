FROM node:20-alpine

WORKDIR /usr/src/app

COPY package*.json tsconfig*.json ./
COPY patches/ ./patches
RUN npm install -g typescript patch-package && \
npm ci --omit=dev

COPY src/ ./src
COPY chain-specs/ ./chain-specs
COPY config/ ./config
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

CMD node dist/main.js
