-- CreateTable
CREATE TABLE "langchain_pg_collection" (
    "uuid" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "cmetadata" JSONB,

    CONSTRAINT "langchain_pg_collection_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "langchain_pg_embedding" (
    "id" UUID NOT NULL,
    "collection_id" UUID,
    "embedding" vector,
    "document" TEXT,
    "cmetadata" JSONB,

    CONSTRAINT "langchain_pg_embedding_pkey" PRIMARY KEY ("id")
);
