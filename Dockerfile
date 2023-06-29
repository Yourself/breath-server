FROM node:18-alpine AS BUILD_IMAGE

RUN apk add npm pango-dev g++ make jpeg-dev giflib-dev librsvg-dev && npm install -g pnpm

WORKDIR /home/breath-server

COPY package*.json ./

RUN pnpm i

COPY . .

ENV NODE_PATH=./src

RUN pnpm run build && pnpm test

FROM node:18-alpine

WORKDIR /home/breath-server

COPY --from=BUILD_IMAGE /home/breath-server/.next ./.next
COPY --from=BUILD_IMAGE /home/breath-server/migrations ./migrations
COPY --from=BUILD_IMAGE /home/breath-server/public ./public
COPY --from=BUILD_IMAGE /home/breath-server/src ./src
COPY --from=BUILD_IMAGE /home/breath-server/node_modules ./node_modules
COPY --from=BUILD_IMAGE /home/breath-server/package.json ./package.json

ARG LISTEN_PORT=3000

CMD ["npm", "run", "start"]