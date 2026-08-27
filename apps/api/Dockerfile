FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN npm install
RUN npm run build -w @fridgeorder/shared
RUN npm run build -w @fridgeorder/api

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
EXPOSE 4200
CMD ["npm", "run", "start", "-w", "@fridgeorder/api"]
