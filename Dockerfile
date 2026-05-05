# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1-alpine AS runtime

ARG IMAGE_TITLE="enefit-price-graph"
ARG IMAGE_DESCRIPTION="Enefit electricity price graph web app"
ARG IMAGE_VERSION
ARG IMAGE_REVISION
ARG IMAGE_SOURCE
ARG IMAGE_CREATED

LABEL org.opencontainers.image.title="$IMAGE_TITLE" \
      org.opencontainers.image.description="$IMAGE_DESCRIPTION" \
      org.opencontainers.image.version="$IMAGE_VERSION" \
      org.opencontainers.image.revision="$IMAGE_REVISION" \
      org.opencontainers.image.source="$IMAGE_SOURCE" \
      org.opencontainers.image.created="$IMAGE_CREATED"

WORKDIR /usr/share/nginx/html
COPY --chown=nginx:nginx --from=build /app/dist ./

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
