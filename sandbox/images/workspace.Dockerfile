FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash git curl ca-certificates python3 python3-pip build-essential \
  && rm -rf /var/lib/apt/lists/*
USER 65534:65534
WORKDIR /workspace
