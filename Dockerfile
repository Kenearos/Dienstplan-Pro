FROM node:20-slim

WORKDIR /app

# Erst Manifeste kopieren → Layer-Cache für npm install
COPY package*.json ./
RUN npm install --omit=dev

# Rest der App
COPY . .

ENV PORT=3000
ENV DATA_DIR=/data
EXPOSE 3000

CMD ["node", "server/index.js"]
