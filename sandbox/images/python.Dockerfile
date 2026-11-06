FROM python:3.12-alpine
RUN addgroup -S runner && adduser -S -G runner runner
USER 65534:65534
WORKDIR /workspace
