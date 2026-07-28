import fs from "node:fs";
import { parseExcelWorkbook } from "../src/lib/excelParser.ts";

const filePath = process.argv[2];
const buffer = fs.readFileSync(filePath);
const result = parseExcelWorkbook(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));

for (const [curriculumName, data] of Object.entries(result)) {
  console.log(`\n=== ${curriculumName} ===`);
  console.log("회차 수:", data.scheduleItems.length);
  console.log("구성요소 수:", data.scheduleComponents.length);
  console.log("경고:", data.warnings.length);
  data.warnings.slice(0, 5).forEach((w) => console.log("  -", w));

  console.log("\n샘플 (회차 1):");
  data.scheduleComponents
    .filter((c) => c.scheduleItemId === `${curriculumName}-1`)
    .forEach((c) => console.log(" ", JSON.stringify(c)));

  const typeCounts = {};
  for (const c of data.scheduleComponents) {
    typeCounts[c.type] = (typeCounts[c.type] ?? 0) + 1;
  }
  console.log("\n타입별 개수:", typeCounts);
}
