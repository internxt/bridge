FROM debian:10

WORKDIR /app

# Create package cache
RUN apt update && apt upgrade -y && apt autoremove -y

# Install utilities
RUN apt install curl build-essential python git -y \
 && git clone https://github.com/internxt/bridge

# Install nvm
ENV NVM_DIR /root/.nvm
ENV NODE_VERSION 14.18.0
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.38.0/install.sh | bash  \
  && . $NVM_DIR/nvm.sh \
  && nvm install $NODE_VERSION \
  && npm i -g yarn \ 
  && cd bridge \
  && yarn --ignore-engines \
  && yarn cache clean

ENV NODE_PATH $NVM_DIR/v$NODE_VERSION/lib/node_modules
ENV PATH $NVM_DIR/versions/node/v$NODE_VERSION/bin:$PATH

# Create Prometheus directories
RUN mkdir -p /mnt/prometheusvol1
RUN mkdir -p /mnt/prometheusvol2

WORKDIR /app/bridge

CMD node bin/storj-bridge.js