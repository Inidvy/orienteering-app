// Generate printable flag plates: a QR (https://ol-ka.de/f/<UFID>) plus the big
// short number and the UFID text. One PNG per flag, ready to laminate.
//
//   node plates.mjs "1:URHNCL" "4:LZRFAH" "9:TASXYH"
//   -> out/flag-1.png ...
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import sharp from "sharp";

const HOST = "ol-ka.de";
const dir = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(dir, "out");
fs.mkdirSync(OUT, { recursive: true });

const flags = process.argv.slice(2).map((a) => {
  const [num, ufid] = a.split(":");
  return { num, ufid };
});
if (flags.length === 0) {
  console.log('usage: node plates.mjs "1:URHNCL" "4:LZRFAH" ...');
  process.exit(1);
}

const W = 700, H = 900;
for (const f of flags) {
  const url = `https://${HOST}/f/${f.ufid}`;
  const qrSvg = await QRCode.toString(url, {
    type: "svg", margin: 1, errorCorrectionLevel: "M",
  });
  // strip the outer <svg> to embed at a fixed box
  const inner = qrSvg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  const qrBox = 460, qrX = (W - qrBox) / 2, qrY = 70;

  const plate =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
    `<rect width="${W}" height="${H}" fill="#fff" stroke="#141414" stroke-width="6"/>` +
    `<text x="${W / 2}" y="52" text-anchor="middle" font-family="sans-serif" ` +
    `font-size="30" font-weight="700" fill="#d10f7c">OL·KA</text>` +
    `<svg x="${qrX}" y="${qrY}" width="${qrBox}" height="${qrBox}" viewBox="0 0 ${
      qrSvgSize(qrSvg)
    } ${qrSvgSize(qrSvg)}">${inner}</svg>` +
    `<text x="${W / 2}" y="${qrY + qrBox + 120}" text-anchor="middle" ` +
    `font-family="sans-serif" font-size="150" font-weight="800" fill="#141414">${f.num}</text>` +
    `<text x="${W / 2}" y="${qrY + qrBox + 185}" text-anchor="middle" ` +
    `font-family="ui-monospace,monospace" font-size="46" letter-spacing="6" fill="#141414">${f.ufid}</text>` +
    `<text x="${W / 2}" y="${H - 30}" text-anchor="middle" ` +
    `font-family="sans-serif" font-size="26" fill="#6b7280">${HOST}/f/${f.ufid}</text>` +
    `</svg>`;

  const outFile = path.join(OUT, `flag-${f.num}.png`);
  await sharp(Buffer.from(plate)).png().toFile(outFile);
  console.log(`flag ${f.num} (${f.ufid}) -> ${outFile}`);
}

function qrSvgSize(svg) {
  const m = svg.match(/viewBox="0 0 (\d+) \d+"/);
  return m ? +m[1] : 100;
}
