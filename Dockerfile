# --- STAGE 1: Build ---
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
RUN npm install

COPY . .

ENV DATABASE_URL="postgresql://johndoe:randompassword@localhost:5432/mydb?schema=public"

RUN npx prisma generate
RUN npm run build

# --- STAGE 2: Production ---
FROM node:20-alpine AS runner
WORKDIR /app

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

CMD ["npm", "run", "start:prod"]