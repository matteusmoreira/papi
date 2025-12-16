FROM node:18

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ENV NODE_ENV=production
ENV PORT=8090
ENV TZ=America/Sao_Paulo

EXPOSE 8090

CMD ["npx", "tsx", "bootstrap.ts"]
