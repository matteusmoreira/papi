FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ENV NODE_ENV=production
ENV PORT=8090

EXPOSE 8090

CMD ["npx", "tsx", "server.ts"]
