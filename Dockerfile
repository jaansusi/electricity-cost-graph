# syntax=docker/dockerfile:1.7

FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1-alpine@sha256:5616878291a2eed594aee8db4dade5878cf7edcb475e59193904b198d9b830de AS runtime

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
COPY --from=build /app/dist ./

RUN sed -i 's|listen       80;|listen       8080;|' /etc/nginx/conf.d/default.conf \
 && sed -i 's|listen  \[::\]:80;|listen  [::]:8080;|' /etc/nginx/conf.d/default.conf \
 && chown -R nginx:nginx /var/cache/nginx /var/log/nginx /etc/nginx/conf.d /usr/share/nginx/html \
 && sed -i 's|user  nginx;|# user  nginx;|' /etc/nginx/nginx.conf \
 && sed -i 's|/var/run/nginx.pid|/tmp/nginx.pid|' /etc/nginx/nginx.conf

USER nginx
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
