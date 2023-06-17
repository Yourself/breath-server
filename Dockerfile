FROM node:18

WORKDIR /home/breath-server

COPY package*.json ./

RUN npm i

COPY . .

ENV NODE_PATH=./dist

RUN npm run build

