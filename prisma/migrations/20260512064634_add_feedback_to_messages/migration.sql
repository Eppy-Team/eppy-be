-- CreateEnum
CREATE TYPE "MessageFeedback" AS ENUM ('HELPFUL', 'NOT_HELPFUL');

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "feedback" "MessageFeedback";
