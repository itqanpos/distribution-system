import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;

function walkJs(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walkJs(path);
    return entry.name.endsWith(".js") ? [path] : [];
  });
}

test("all application JavaScript files parse successfully", () => {
  for (const file of walkJs(join(root, "js"))) {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  }
});

test("HTML files reference existing local scripts and styles", () => {
  for (const name of readdirSync(root)) {
    if (!name.endsWith(".html")) continue;
    const html = readFileSync(join(root, name), "utf8");
    const refs = [...html.matchAll(/(?:src|href)=["']([^"'#?]+)["']/g)];
    for (const [, ref] of refs) {
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref)) continue;
      const target = join(root, ref.replace(/^\.\//, ""));
      assert.equal(
        statSync(target).isFile(),
        true,
        `${name} references missing ${ref}`,
      );
    }
  }
});

test("debt payment is persisted and included in local balance effects", () => {
  const db = readFileSync(join(root, "js/db.js"), "utf8");
  assert.match(
    db,
    /debt_payment_amount:\s*Number\(invoice\.debt_payment_amount\)\s*\|\|\s*0/,
  );
  assert.match(db, /delta = -remaining - used \+ debtPayment/);
  assert.match(db, /delta = \+remaining \+ used - debtPayment/);
});
