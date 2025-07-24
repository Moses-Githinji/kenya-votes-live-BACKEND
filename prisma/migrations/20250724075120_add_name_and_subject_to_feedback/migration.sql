/*
  Warnings:

  - Added the required column `name` to the `feedback` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "feedback" ADD COLUMN     "name" TEXT NOT NULL,
ADD COLUMN     "subject" TEXT;
