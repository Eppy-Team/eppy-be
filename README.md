<p align="center">
  <img width="200" height="75" alt="logo eppy 2" src="https://github.com/user-attachments/assets/a6582967-f9d6-456f-8239-7f013efc3536" />
</p>

<h2 align="center"><b>Eppy — Smart Helpdesk Chatbot 🤖</b><br/>Backend Service (NestJS)</h2>

<p align="center">
  Backend API for an AI-powered helpdesk system built to optimize technical support services at <b>PT Epson Indonesia Industry</b>.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/NestJS-11.x-E0234E?style=flat&logo=nestjs" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat&logo=typescript" />
  <img src="https://img.shields.io/badge/PostgreSQL-pgvector-4169E1?style=flat&logo=postgresql" />
  <img src="https://img.shields.io/badge/AWS-S3%20%7C%20SES-FF9900?style=flat&logo=amazonaws" />
  <img src="https://img.shields.io/badge/Prisma-ORM-2D3748?style=flat&logo=prisma" />
</p>

---

## 📖 About

In high-speed industrial environments, every second counts. **Eppy** is an AI-powered helpdesk orchestrator designed to eliminate technical support bottlenecks at **PT Epson Indonesia** by transforming static knowledge bases into an intelligent, autonomous conversational experience. 🤖

By leveraging **Retrieval-Augmented Generation (RAG)**, Eppy empowers users to resolve technical issues independently and instantly. This **NestJS** backend serves as the **core orchestrator**—managing secure authentication, complex data persistence, and seamless AI integration to deliver high-precision support 24/7.

This project is developed as part of the **Capstone Project (Topic A.5)** for the Computer Science Faculty at **Universitas Brawijaya 2026**, bridging the gap between academic innovation and real-world industrial excellence. 🚀✨

---

## ✨ Features

- 🔐 **Authentication** — JWT-based auth with USER and ADMIN roles
- 💬 **Chatbot** — AI-powered conversations with Knowledge Base, supports image uploads
- 📁 **Knowledge Management** — Admin uploads PDF documents; AI automatically processes embeddings
- 🎫 **Ticket System** — Users create tickets manually when AI responses are unsatisfactory; admins respond via dashboard
- 📧 **Email Notification** — Automatic email via AWS SES when admin responds to a ticket
- 📊 **Dashboard Analytics** — Chatbot statistics, user satisfaction, AI performance, PDF & Excel export
- ☁️ **Cloud Storage** — Image and PDF uploads to AWS S3 with signed URLs

---

## 🛠️ Tech Stack

| Category | Technology |
|----------|------------|
| Framework | NestJS 11.x + TypeScript 5.x |
| Database | PostgreSQL + pgvector (via Prisma ORM) |
| Authentication | Passport.js + JWT |
| Cloud Storage | AWS S3 |
| Email | AWS SES |
| Containerization | Docker + Docker Compose |
| CI/ CD | Github Actions |
| AI Integration | HTTP client to AI Service (Python + LangChain) |

---

## 🏗️ System Architecture

<img width="5121" height="4450" alt="Eppy System Architecture Diagram (mermaid js)" src="https://github.com/user-attachments/assets/f4d7c695-e99f-42eb-b456-6014bd2678df" />

---

## 📂 Folder Structure

```
src/
│   app.module.ts
│   main.ts
├───ai/
│   │   ai.module.ts
│   │   ai.service.ts
│   └───dto/
├───auth/
│   │   auth.controller.ts
│   │   auth.module.ts
│   │   auth.repository.ts
│   │   auth.service.ts
│   ├───dto/
│   └───strategies/
├───chat/
│   │   chat.controller.ts
│   │   chat.module.ts
│   │   chat.repository.ts
│   │   chat.service.ts
│   └───dto/
├───common/
│   ├───decorators/
│   ├───filters/
│   ├───guards/
│   └───interceptors/
├───conversation/
│   │   conversation.controller.ts
│   │   conversation.module.ts
│   │   conversation.repository.ts
│   │   conversation.service.ts
│   └───dto/
├───dashboard/
│       dashboard.controller.ts
│       dashboard.module.ts
│       dashboard.repository.ts
│       dashboard.service.ts
├───knowledge/
│   │   knowledge.controller.ts
│   │   knowledge.module.ts
│   │   knowledge.repository.ts
│   │   knowledge.service.ts
│   └───dto/
├───mail/
│   │   mail.module.ts
│   │   mail.service.ts
│   └───templates
├───prisma/
│       prisma.module.ts
│       prisma.service.ts
├───storage/
│       storage.module.ts
│       storage.service.ts
└───ticket/
    │   ticket.controller.ts
    │   ticket.module.ts
    │   ticket.repository.ts
    │   ticket.service.ts
    └───dto/
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js >= 18.x
- npm >= 9.x
- PostgreSQL >= 14.x with `pgvector` extension
- Docker & Docker Compose (optional)
- AWS Account (S3 + SES)

### 1. Clone & Install

```bash
git clone <repository-url>
cd eppy-be
npm install
```

### 2. Environment Variables

Create a `.env` file in the root directory:

```env
# Server
PORT=3000

# Database
DATABASE_URL="postgresql://user:password@localhost:5432/eppy_db"

# JWT
JWT_SECRET_KEY="your_jwt_secret_min_32_chars"
JWT_EXPIRES_IN="7d"

# AI Service
AI_SERVICE_URL="http://localhost:8000"
AI_SERVICE_TIMEOUT_MS=30000
AI_SERVICE_MOCK=true        # set to false when AI Service is running

# AWS
AWS_REGION="ap-southeast-1"
AWS_ACCESS_KEY_ID="your_access_key"
AWS_SECRET_ACCESS_KEY="your_secret_key"
AWS_S3_BUCKET_NAME="your_bucket_name"
STORAGE_TYPE=s3
```

### 3. Database Setup

```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev
```

### 4. Run the Application

```bash
# Development (hot reload)
npm run start:dev

# Production
npm run build
npm run start:prod
```

Server runs at `http://localhost:3000`

### Alternative: Docker Compose

```bash
# Development
docker-compose up -d

# Production
docker-compose -f docker-compose.prod.yml up -d
```

---

## 📑 API Documentation

Full interactive documentation (Request/Response schemas, examples, and testing) can be accessed via:

🔗 [Eppy Documentation](https://documenter.getpostman.com/view/41537989/2sBXqDrNLE)

---

## 🗄️ Database Schema

<img width="7825" height="5967" alt="Eppy Database Schema (mermaid js)" src="https://github.com/user-attachments/assets/a0e3a750-efa8-479b-af3b-1bd80c349013" />

---

## 🔗 Related Repositories

📦 The Frontend Layer [View Repository](https://github.com/Eppy-Team/eppy-fe). Built with Next.js and Tailwind CSS to provide a seamless chat experience and a robust management dashboard for admins.

🧠 The Intelligence Layer [View Repository](https://github.com/Eppy-Team/eppy-ai). A dedicated Python service powered by LangChain that manages document chunking, embeddings, and the RAG pipeline to ensure high-accuracy AI responses.

---

## 👥 Team — Group 3, Capstone A.5

- [@Nikita](https://www.linkedin.com/in/nikita-tsalis-akmalinda-yanisa/) — Product Manager
- [@Dinda](https://www.linkedin.com/in/dindaazqa/) — Business Analyst
- [@Pricilia](https://www.linkedin.com/in/pricilia-gladys-simbolon-a84a6b281/) — UI/ UX Designer
- [@Alif](https://www.linkedin.com/in/alif-muh-iqbal/) — Frontend Developer 
- [@Abdi](https://www.linkedin.com/in/muktiabdii/) — Backend Developer
- [@Hafid](https://www.linkedin.com/in/moh-zukhruf-artha-hafidzuddin-5915ab222/) — AI Engineer 
