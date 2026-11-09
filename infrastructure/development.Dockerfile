FROM node:24-slim

# Create a non-root user
RUN groupadd -r myuser && useradd -r -g myuser myuser -d /app

# Create the application directory and set permissions
RUN mkdir -p /app && chown -R myuser:myuser /app

USER myuser

WORKDIR /app

COPY --chown=myuser:myuser . ./

# Install dependencies
RUN yarn --ignore-engines && yarn cache clean

CMD yarn dev
