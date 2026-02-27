/*
  Warnings:

  - Added the required column `originalName` to the `File` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "File" ADD COLUMN     "gcsPath" TEXT,
ADD COLUMN     "originalName" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
