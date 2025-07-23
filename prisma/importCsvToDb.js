import { PrismaClient } from "@prisma/client";
import fs from "fs";
import { parse } from "csv-parse";

const prisma = new PrismaClient();

async function importConstituencies() {
  const parser = fs
    .createReadStream("prisma/data/constituencies.csv")
    .pipe(parse({ columns: true, trim: true }));
  let count = 0;
  for await (const row of parser) {
    try {
      await prisma.region.create({
        data: {
          name: row.name,
          code: row.code,
          type: "CONSTITUENCY",
          parent: { connect: { code: row.countyCode } },
        },
      });
      count++;
    } catch (e) {
      console.error(
        `Failed to import constituency ${row.name} (${row.code}):`,
        e.message
      );
    }
  }
  console.log(`✅ Imported ${count} constituencies from CSV`);
}

async function importWards() {
  const parser = fs
    .createReadStream("prisma/data/kenya_wards.csv")
    .pipe(parse({ columns: true, trim: true }));
  let count = 0;
  for await (const row of parser) {
    try {
      await prisma.region.create({
        data: {
          name: row.name,
          code: row.code,
          type: "WARD",
          parent: { connect: { code: row.constituencyCode } },
        },
      });
      count++;
    } catch (e) {
      console.error(
        `Failed to import ward ${row.name} (${row.code}):`,
        e.message
      );
    }
  }
  console.log(`✅ Imported ${count} wards from CSV`);
}

async function main() {
  await importConstituencies();
  await importWards();
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
