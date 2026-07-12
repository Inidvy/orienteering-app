import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(dir, "..", "..", "map", "export_300dpi.png");
const out = path.join(dir, "hadiko_small.png");

const info = await sharp(src).resize(1400).png().toFile(out);
console.log("resized", info.width, "x", info.height, "->", out);
