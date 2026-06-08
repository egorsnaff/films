FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV DATABASE_PATH=/data/films.db
ENV PORT=3001

EXPOSE 3001

CMD ["npm", "start"]
