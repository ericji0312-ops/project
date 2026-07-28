import xlsx from "xlsx";

const src = process.argv[2];
const outPath = process.argv[3];
const maxRound = Number(process.argv[4] ?? 5);

const wb = xlsx.readFile(src);
const sheetName = wb.SheetNames[0];
const sheet = wb.Sheets[sheetName];
const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "" });

const header = rows[0];
const body = rows.slice(1).filter((r) => Number(r[0]) <= maxRound);

const newSheet = xlsx.utils.aoa_to_sheet([header, ...body]);
const newWb = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(newWb, newSheet, sheetName);
xlsx.writeFile(newWb, outPath);
console.log(`wrote ${outPath}: ${body.length} rows (round <= ${maxRound})`);
