import { readFile } from "node:fs/promises";
import { approveEquivalence } from "../server/services/supplierEquivalence";

// Intentionally local/trusted operations only; no customer-facing approval API.
const path = process.argv[2];
if (!path) throw new Error("Usage: npx tsx scripts/approve-equivalence.ts approval.json");
try {
  const id = await approveEquivalence(JSON.parse(await readFile(path, "utf8")));
  console.log(`Approved immutable equivalence version ${id}`);
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Equivalence approval failed");
  process.exit(1);
}
