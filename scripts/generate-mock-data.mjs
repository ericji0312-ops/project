import fs from "node:fs";
import path from "node:path";
import { parseExcelWorkbook } from "../src/lib/excelParser.ts";

const filePath = process.argv[2];
const buffer = fs.readFileSync(filePath);
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
const result = parseExcelWorkbook(arrayBuffer);

const outDir = path.resolve("src/lib/mockData");
fs.mkdirSync(outDir, { recursive: true });

for (const [curriculumName, data] of Object.entries(result)) {
  const outPath = path.join(outDir, `${curriculumName}.json`);
  fs.writeFileSync(
    outPath,
    JSON.stringify({ scheduleItems: data.scheduleItems, scheduleComponents: data.scheduleComponents }, null, 2),
    "utf-8"
  );
  console.log(`wrote ${outPath} (${data.scheduleItems.length} items, ${data.scheduleComponents.length} components)`);
}
