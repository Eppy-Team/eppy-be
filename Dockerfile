FROM node:20

WORKDIR /app

# Copy package.json dulu (biar cache optimal)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy semua source code
COPY . .

# Expose port
EXPOSE 3000

# Jalankan app (Prisma generate saat runtime)
CMD ["npm", "run", "start:dev"]