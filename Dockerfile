FROM node:18

ARG LISTEN_PORT=3000

WORKDIR /home/breath-server

COPY package*.json ./

RUN npm i

COPY . .

ENV NODE_PATH=./src

RUN npm run build

