// Printable flag sticker: orienteering control-flag graphic, the big number,
// the QR (https://ol-ka.de/f/UFID), and the UFID. Preview + PNG download +
// print. All in-browser; nothing to install for the user.

import { useEffect, useState } from "react";
import QRCode from "qrcode";

const HOST = "ol-ka.de";
const W = 620;
const H = 820;

// Classic orienteering control marker: a square split on the diagonal,
// white (top-left) + orange (bottom-right). Drawn at (x,y) size s.
function controlFlag(x: number, y: number, s: number): string {
  const o = "#ff7a00";
  return (
    `<g transform="translate(${x} ${y})">` +
    `<rect width="${s}" height="${s}" fill="#fff" stroke="#141414" stroke-width="2"/>` +
    `<polygon points="${s},0 ${s},${s} 0,${s}" fill="${o}"/>` +
    `<rect width="${s}" height="${s}" fill="none" stroke="#141414" stroke-width="2"/>` +
    `</g>`
  );
}

function plateSvg(shortCode: string, ufid: string, qrDataUrl: string): string {
  const url = `${HOST}/f/${ufid}`;
  const qrBox = 360, qrX = (W - qrBox) / 2, qrY = 150;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect x="6" y="6" width="${W - 12}" height="${H - 12}" rx="28" fill="#fff" stroke="#141414" stroke-width="5"/>` +
    // header: control flag + wordmark
    controlFlag(40, 40, 56) +
    `<text x="${W - 40}" y="82" text-anchor="end" font-family="system-ui,sans-serif" ` +
    `font-size="34" font-weight="800" fill="#d10f7c">OL·KA</text>` +
    `<line x1="40" y1="120" x2="${W - 40}" y2="120" stroke="#eee" stroke-width="2"/>` +
    // QR
    `<rect x="${qrX - 14}" y="${qrY - 14}" width="${qrBox + 28}" height="${qrBox + 28}" rx="16" fill="#fff" stroke="#eee" stroke-width="2"/>` +
    `<image x="${qrX}" y="${qrY}" width="${qrBox}" height="${qrBox}" href="${qrDataUrl}"/>` +
    // big number
    `<text x="${W / 2}" y="${qrY + qrBox + 140}" text-anchor="middle" ` +
    `font-family="system-ui,sans-serif" font-size="150" font-weight="800" fill="#141414">${shortCode}</text>` +
    // UFID pill
    `<rect x="${W / 2 - 150}" y="${qrY + qrBox + 168}" width="300" height="58" rx="29" fill="#141414"/>` +
    `<text x="${W / 2}" y="${qrY + qrBox + 207}" text-anchor="middle" ` +
    `font-family="ui-monospace,Menlo,monospace" font-size="40" letter-spacing="7" fill="#fff">${ufid}</text>` +
    // footer url
    `<text x="${W / 2}" y="${H - 34}" text-anchor="middle" ` +
    `font-family="system-ui,sans-serif" font-size="26" fill="#6b7280">${url}</text>` +
    `</svg>`
  );
}

export function Plate({
  shortCode,
  ufid,
  onClose,
}: {
  shortCode: string;
  ufid: string;
  onClose: () => void;
}) {
  const [svg, setSvg] = useState("");

  useEffect(() => {
    QRCode.toDataURL(`https://${HOST}/f/${ufid}`, {
      margin: 0,
      errorCorrectionLevel: "M",
      width: 512,
    }).then((qr) => setSvg(plateSvg(shortCode, ufid, qr)));
  }, [shortCode, ufid]);

  const download = () => {
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const scale = 2; // crisp
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
        a.download = `flag-${shortCode}-${ufid}.png`;
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
