import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { brotliDecompressSync } from "node:zlib";
import { createHash } from "node:crypto";

const packed = [1, 2, 3, 4, 5, 6]
  .map((part) => readFileSync(new URL(`./home-art-part-${part}.txt`, import.meta.url), "utf8").trim())
  .join("");
const expected = "896eef4aa78523d3f2cc0dde14f0bdfa148afccbb9c11438c3195074a21f7478";
if (createHash("sha256").update(packed).digest("hex") !== expected) {
  throw new Error("Home artwork payload checksum mismatch");
}
const files = JSON.parse(brotliDecompressSync(Buffer.from(packed, "base64")).toString("utf8"));
const allowed = ["public/masthead-stadium.svg", "public/stadium-crowd.svg", "src/home-art.css"];
if (Object.keys(files).sort().join("|") !== allowed.sort().join("|")) {
  throw new Error("Unexpected home artwork manifest");
}
for (const path of allowed) {
  const content = files[path];
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
  const data = Buffer.from(content, "utf8").toString("base64");
  for (let start = 0; start < data.length; start += 1600) {
    console.log(`HOME_ART_FILE|${path}|${start / 1600}|${data.slice(start, start + 1600)}`);
  }
}
