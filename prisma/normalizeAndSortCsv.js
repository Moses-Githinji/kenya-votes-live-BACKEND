import fs from "fs";
import { parse } from "csv-parse";
import { stringify } from "csv-stringify";

async function normalizeConstituencies() {
  const input = "prisma/data/constituencies.csv";
  const output = "prisma/data/constituencies.normalized.csv";
  const rows = [];
  const parser = fs
    .createReadStream(input)
    .pipe(parse({ columns: true, trim: true }));
  for await (const row of parser) {
    if (!row["CONST_CODE"] || !row["CONSTITUEN"] || !row["COUNTY_COD"])
      continue;
    rows.push({
      code: row["CONST_CODE"],
      name: row["CONSTITUEN"],
      countyCode: row["COUNTY_COD"],
    });
  }
  rows.sort((a, b) => a.code.localeCompare(b.code));
  stringify(
    rows,
    { header: true, columns: ["code", "name", "countyCode"] },
    (err, outputCsv) => {
      if (err) throw err;
      fs.writeFileSync(output, outputCsv);
      console.log(`✅ Normalized and sorted constituencies to ${output}`);
    }
  );
}

async function normalizeWards() {
  const input = "prisma/data/kenya_wards.csv";
  const output = "prisma/data/kenya_wards.normalized.csv";
  const rows = [];
  const parser = fs
    .createReadStream(input)
    .pipe(parse({ columns: true, trim: true }));
  for await (const row of parser) {
    if (!row["uid"] || !row["ward"] || !row["scuid"]) continue;
    rows.push({
      code: row["uid"],
      name: row["ward"],
      constituencyCode: row["scuid"],
    });
  }
  rows.sort((a, b) => a.code.localeCompare(b.code));
  stringify(
    rows,
    { header: true, columns: ["code", "name", "constituencyCode"] },
    (err, outputCsv) => {
      if (err) throw err;
      fs.writeFileSync(output, outputCsv);
      console.log(`✅ Normalized and sorted wards to ${output}`);
    }
  );
}

async function main() {
  await normalizeConstituencies();
  await normalizeWards();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
