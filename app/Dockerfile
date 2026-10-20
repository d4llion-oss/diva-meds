FROM node:22-alpine
WORKDIR /app
COPY server.js ./
COPY public ./public
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data TZ=America/Chicago
VOLUME ["/data"]
EXPOSE 8080
USER node
CMD ["node", "server.js"]
