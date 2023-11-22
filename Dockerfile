FROM debian:11

WORKDIR /app

# Create package cache
RUN apt update && apt upgrade -y && apt autoremove -y

# Install utilities
RUN apt install curl build-essential python3 git -y && apt clean

COPY . ./

# Install nvm
ENV NVM_DIR /root/.nvm
ENV NODE_VERSION 16.14.2
RUN curl https://raw.githubusercontent.com/creationix/nvm/master/install.sh | bash \
  && . $NVM_DIR/nvm.sh \
  && nvm install $NODE_VERSION \
  && npm i -g yarn \ 
  && yarn --ignore-engines \
  && yarn run build \
  && yarn cache clean

ENV NODE_PATH $NVM_DIR/v$NODE_VERSION/lib/node_modules
ENV PATH $NVM_DIR/versions/node/v$NODE_VERSION/bin:$PATH

# Create Prometheus directories
RUN mkdir -p /mnt/prometheusvol1
RUN mkdir -p /mnt/prometheusvol2

CMD node ./dist/bin/storj-bridge.js
