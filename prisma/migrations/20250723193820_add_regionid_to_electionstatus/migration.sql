/*
  Warnings:

  - A unique constraint covering the columns `[position,regionId]` on the table `election_status` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `regionId` to the `election_status` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "election_status_position_key";

-- AlterTable
ALTER TABLE "election_status" ADD COLUMN     "regionId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "election_status_position_regionId_key" ON "election_status"("position", "regionId");

-- AddForeignKey
ALTER TABLE "election_status" ADD CONSTRAINT "election_status_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
