FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Vite reads these at build time. One build serves every company.
ARG VITE_API_URL
ARG VITE_APP_DOMAIN
ENV VITE_API_URL=$VITE_API_URL VITE_APP_DOMAIN=$VITE_APP_DOMAIN
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
