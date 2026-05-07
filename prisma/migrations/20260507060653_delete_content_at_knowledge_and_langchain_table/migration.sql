/*
  Warnings:

  - You are about to drop the column `content` on the `knowledge_articles` table. All the data in the column will be lost.
  - You are about to drop the `langchain_pg_collection` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `langchain_pg_embedding` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "knowledge_articles" DROP COLUMN "content";

-- DropTable
DROP TABLE "langchain_pg_collection";

-- DropTable
DROP TABLE "langchain_pg_embedding";
