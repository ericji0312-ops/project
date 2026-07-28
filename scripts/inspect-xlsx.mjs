import xlsx from "xlsx";

const filePath = process.argv[2];
const wb = xlsx.readFile(filePath);

for (const sheetName of wb.SheetNames) {
  const sheet = wb.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  console.log(`\n=== Sheet: ${sheetName} (${rows.length} rows) ===`);
  rows.slice(0, 15).forEach((row, i) => {
    console.log(i, JSON.stringify(row));
  });
}
