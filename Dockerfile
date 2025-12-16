FROM node:20

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# build TS -> JS
RUN npm run build

ENV NODE_ENV=production
ENV PORT=8090
ENV TZ=America/Sao_Paulo

EXPOSE 8090

CMD ["node", "dist/server.js"]
