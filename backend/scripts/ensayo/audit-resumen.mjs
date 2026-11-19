// Resume la salida de `npm audit --json`: total de avisos y los que afectan a next, con su enlace.
//   node audit-resumen.mjs audit.json
import { readFileSync } from "node:fs";

const audit = JSON.parse(readFileSync(process.argv[2], "utf8"));
const vulnerabilities = audit.vulnerabilities ?? {};
const total = audit.metadata?.vulnerabilities?.total ?? Object.keys(vulnerabilities).length;
console.log(`avisos en total: ${total}`);
for (const [name, entry] of Object.entries(vulnerabilities)) {
  const advisories = entry.via.filter((via) => typeof via === "object").map((via) => `${via.url} (${via.severity})`);
  console.log(`${name} ${entry.range}: ${advisories.length ? advisories.join(", ") : `por dependencia de ${entry.via.join(", ")}`}`);
}
const next = vulnerabilities.next;
console.log(next ? "NEXT CON AVISOS" : "next sin avisos");
process.exitCode = next ? 1 : 0;
