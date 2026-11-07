FROM node:22-alpine
RUN apk add --no-cache docker-cli
WORKDIR /app
COPY runner.mjs ./runner.mjs
ENV PORT=8787
EXPOSE 8787
CMD ["node", "runner.mjs"]
