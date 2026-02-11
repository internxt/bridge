FROM node:16.20.2-bullseye-slim

# Create a non-root user
RUN groupadd -r myuser && useradd -r -g myuser myuser -d /app

# Create package cache
RUN apt update && apt upgrade -y && apt autoremove -y \
  && apt install -y --no-install-recommends curl build-essential python3 git \ 
  && apt clean

# Create app directory and give ownership
RUN mkdir -p /app && chown -R myuser:myuser /app

WORKDIR /app

COPY . ./

RUN chown -R myuser:myuser /app

USER myuser

ENV YARN_CACHE_FOLDER=/app/.yarn-cache \
    NPM_CONFIG_PREFIX=/app/.npm-global \
    PATH=$PATH:/app/.npm-global/bin

# Install and build
RUN yarn --ignore-engines && yarn cache clean

RUN mkdir -p /app/.inxt-bridge/items && chmod -R 775 /app/.inxt-bridge

CMD ["yarn", "dev"]
