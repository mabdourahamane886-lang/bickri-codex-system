# Dedicated Android build image. The runner never mounts host secrets or the Docker socket into this container.
FROM ghcr.io/cirruslabs/flutter:stable
WORKDIR /workspace
ENV PUB_CACHE=/tmp/.pub-cache
