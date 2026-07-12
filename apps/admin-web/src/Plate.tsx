// Printable flag sticker. The flag NUMBER is the code (no separate UFID): the
// QR encodes https://ol-ka.de/f/<number>. The OL-KA control-flag mark is set
// INTO the centre of the QR (error correction H keeps it scannable) and shown
// large in the header. Preview + PNG download + print, all in-browser.

import { useEffect, useState } from "react";
import QRCode from "qrcode";

const HOST = "ol-ka.de";
const W = 620;
const H = 780;

// Orienteering control mark: square split on the diagonal, white + orange.
function controlFlag(x: number, y: number, s: number, sw = 2): string {
  return (
    `<g transform="translate(${x} ${y})">` +
    `<rect width="${s}" height="${s}" fill="#fff"/>` +
    `<polygon points="${s},0 ${s},${s} 0,${s}" fill="#ff7a00"/>` +
    `<rect width="${s}" height="${s}" fill="none" stroke="#141414" stroke-width="${sw}"/>` +
    `</g>`
  );
}

function plateSvg(code: string, qrDataUrl: string): string {
  const url = `${HOST}/f/${code}`;
  const qrBox = 380, qrX = (W - qrBox) / 2, qrY = 150;
  // centre logo badge on the QR (~24% -> safe with ECC H)
  const badge = 96, bx = qrX + (qrBox - badge) / 2, by = qrY + (qrBox - badge) / 2;
  const flagS = 58, fx = bx + (badge - flagS) / 2, fy = by + (badge - flagS) / 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect x="6" y="6" width="${W - 12}" height="${H - 12}" rx="28" fill="#fff" stroke="#141414" stroke-width="5"/>` +
    // prominent header: control flag + big OL·KA
    controlFlag(46, 44, 64, 3) +
    `<text x="128" y="94" font-family="system-ui,sans-serif" font-size="52" ` +
    `font-weight="800" fill="#d10f7c">OL<tspan fill="#141414">·</tspan>KA</text>` +
    `<line x1="46" y1="128" x2="${W - 46}" y2="128" stroke="#eee" stroke-width="2"/>` +
    // QR
    `<image x="${qrX}" y="${qrY}" width="${qrBox}" height="${qrBox}" href="${qrDataUrl}"/>` +
    // centre logo badge (white rounded clearing + control flag)
    `<rect x="${bx}" y="${by}" width="${badge}" height="${badge}" rx="16" fill="#fff" stroke="#141414" stroke-width="3"/>` +
    controlFlag(fx, fy, flagS, 2) +
    // big code = the UFID (4 letters, monospaced)
    `<text x="${W / 2}" y="${qrY + qrBox + 150}" text-anchor="middle" ` +
    `font-family="ui-monospace,Menlo,monospace" font-size="126" font-weight="800" ` +
    `letter-spacing="8" fill="#141414">${code}</text>` +
    // footer url
    `<text x="${W / 2}" y="${H - 40}" text-anchor="middle" ` +
    `font-family="system-ui,sans-serif" font-size="28" fill="#6b7280">${url}</text>` +
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
