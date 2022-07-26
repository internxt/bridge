FROM debian:11

WORKDIR /app

# Create package cache
RUN apt update && apt upgrade -y && apt autoremove -y

# Install utilities
RUN apt install curl build-essential python git -y 

COPY package.json ./
COPY yarn.lock ./

# Install nvm
ENV NVM_DIR /root/.nvm
ENV NODE_VERSION 14.18.0
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.38.0/install.sh | bash  \
  && . $NVM_DIR/nvm.sh \
  && nvm install $NODE_VERSION \
  && npm i -g yarn \ 
  && yarn --ignore-engines \
  && yarn cache clean

COPY . ./

ENV NODE_PATH $NVM_DIR/v$NODE_VERSION/lib/node_modules
ENV PATH $NVM_DIR/versions/node/v$NODE_VERSION/bin:$PATH

CMD ["yarn", "dev"]