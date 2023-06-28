FROM node:18

ARG LISTEN_PORT=3000

RUN npm install -g pnpm

WORKDIR /home/breath-server

COPY package*.json ./

RUN pnpm i

COPY . .

ENV NODE_PATH=./src

RUN pnpm run build

ENV NODE_ENV=production

RUN pnpm i