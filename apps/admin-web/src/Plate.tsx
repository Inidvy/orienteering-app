// Printable flag sticker. The flag NUMBER is the code (no separate UFID): the
// QR encodes https://ol-ka.de/f/<number>. The OL-KA control-flag mark is set
// INTO the centre of the QR (error correction H keeps it scannable) and shown
// large in the header. Preview + PNG download + print, all in-browser.

import { useEffect, useState } from "react";
import QRCode from "qrcode";

const HOST = "ol-ka.de";
const ORANGE = "#ff6a00";
// A5 portrait proportions, matching template.svg
const W = 560;
const H = 794;

// Orienteering control mark: square split on the diagonal, white + orange.
function controlFlag(x: number, y: number, s: number, sw = 2): string {
  return (
    `<g transform="translate(${x} ${y})">` +
    `<rect width="${s}" height="${s}" fill="#fff"/>` +
    `<polygon points="${s},0 ${s},${s} 0,${s}" fill="${ORANGE}"/>` +
    `<rect width="${s}" height="${s}" fill="none" stroke="#141414" stroke-width="${sw}"/>` +
    `</g>`
  );
}

function plateSvg(code: string, qrDataUrl: string): string {
  const qrBox = 410, qrX = (W - qrBox) / 2, qrY = 90;
  // centre logo badge on the QR (~24% -> safe with ECC H)
  const badge = 104, bx = qrX + (qrBox - badge) / 2, by = qrY + (qrBox - badge) / 2;
  const flagS = 64, fx = bx + (badge - flagS) / 2, fy = by + (badge - flagS) / 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    // white base + thin cut border
    `<rect x="3" y="3" width="${W - 6}" height="${H - 6}" fill="#fff" stroke="#e5e5e5" stroke-width="2"/>` +
    // bottom orange diagonal wedge (top-right corner down to the left edge)
    `<path d="M ${W},0 L 0,${H * 0.72} L 0,${H} L ${W},${H} Z" fill="${ORANGE}"/>` +
    // brand top-left
    `<text x="34" y="70" font-family="system-ui,sans-serif" font-size="52" ` +
    `font-weight="800" fill="${ORANGE}">ol-ka.de</text>` +
    // white QR card
    `<rect x="${qrX}" y="${qrY}" width="${qrBox}" height="${qrBox}" rx="26" fill="#fff" ` +
    `stroke="#141414" stroke-width="3"/>` +
    `<image x="${qrX + 20}" y="${qrY + 20}" width="${qrBox - 40}" height="${qrBox - 40}" href="${qrDataUrl}"/>` +
    // control-flag logo in the QR centre
    `<rect x="${bx}" y="${by}" width="${badge}" height="${badge}" rx="16" fill="#fff" stroke="#141414" stroke-width="3"/>` +
    controlFlag(fx, fy, flagS, 2) +
    // big code, white on the orange
    `<text x="${W / 2}" y="${H - 90}" text-anchor="middle" ` +
    `font-family="system-ui,sans-serif" font-size="150" font-weight="800" ` +
    `letter-spacing="14" fill="#fff">${code}</text>` +
    `</svg>`
  );
}

export function Plate({
  code,
  onClose,
}: {
  /** the 4-letter UFID, used as the public code + big label */
  code: string;
  onClose: () => void;
}) {
  const [svg, setSvg] = useState("");

  useEffect(() => {
    QRCode.toDataURL(`https://${HOST}/f/${code}`, {
      margin: 1,
      errorCorrectionLevel: "H", // 30% — survives the centre logo
      width: 560,
    }).then((qr) => setSvg(plateSvg(code, qr)));
  }, [code]);

  const download = () => {
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const c = document.createElement("canvas");
      c.width = W * scale;
      c.height = H * scale;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => {
        if (!b) return;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(b);
        a.download = `flag-${code}.png`;
        a.click();
      }, "image/png");
    };
    img.src = url;
  };

  const print = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(
      `<html><body style="margin:0;display:flex;justify-content:center">${svg}` +
        `<script>window.onload=()=>window.print()</` + `script></body></html>`,
    );
    w.document.close();
  };

  return (
    <div className="plateModal" onClick={onClose}>
      <div className="plateCard" onClick={(e) => e.stopPropagation()}>
        <div className="plateSvg" dangerouslySetInnerHTML={{ __html: svg }} />
        <div className="plateBtns">
          <button onClick={download}>Download PNG</button>
          <button onClick={print}>Print</button>
          <button className="chip" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
