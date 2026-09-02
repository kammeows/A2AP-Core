import fs from "node:fs";
import path from "node:path";
import { run } from "node:test";
import { spec } from "node:test/reporters";
import { fileURLToPath } from "node:url";

process.env.NODE_ENV = "test";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getTestFiles(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (file !== "node_modules" && file !== "dist") {
        results = results.concat(getTestFiles(filePath));
      }
    } else if (file.endsWith(".test.js") || file.endsWith(".test.ts")) {
      results.push(filePath);
    }
  }
  return results;
}

const files = getTestFiles(__dirname);
run({ files })
  .on("test:fail", () => {
    process.exitCode = 1;
  })
  .compose(new spec())
  .pipe(process.stdout);
