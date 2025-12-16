FROM node:20

WORKDIR /app

RUN corepack enable

COPY package.json yarn.lock ./

RUN yarn install --immutable

COPY . .

ENV NODE_ENV=production

EXPOSE 8090

CMD ["yarn", "server"]
