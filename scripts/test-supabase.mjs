import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const env = Object.fromEntries(
  fs
    .readFileSync(new URL("../.env.local", import.meta.url), "utf-8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const tables = ["subjects", "curricula", "schedule_items", "schedule_components", "students", "assignments"];
for (const table of tables) {
  const { error, count } = await supabase.from(table).select("*", { count: "exact", head: true });
  console.log(table, error ? `ERROR: ${error.message}` : `OK (rows: ${count})`);
}
