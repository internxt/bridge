FROM node:16.14.2-slim

# Create a non-root user
RUN groupadd -r myuser && useradd -r -g myuser myuser -d /app

# Create package cache
RUN apt update && apt upgrade -y && apt autoremove -y \
  && apt install -y --no-install-recommends curl build-essential python3 git \ 
  && apt clean

# Create the application directory and set permissions
RUN mkdir -p /app && chown -R myuser:myuser /app

USER myuser

WORKDIR /app

COPY --chown=myuser:myuser . ./

# Install dependencies
RUN yarn --ignore-engines && yarn cache clean

CMD yarn dev
