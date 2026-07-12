// Printable flag sticker — the user's template.svg with the UFID and the QR
// swapped in. Orange QR to match the design ("same orange as everything"),
// rounded corners. Preview + PNG download + print.

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import template from "./sticker.svg?raw";

const HOST = "ol-ka.de";
const ORANGE = "#ff7f2a";

export function Plate({
  code,
  onClose,
}: {
  /** the 4-letter UFID */
  code: string;
  onClose: () => void;
}) {
  const [svg, setSvg] = useState("");

  useEffect(() => {
    QRCode.toDataURL(`https://${HOST}/f/${code}`, {
      margin: 1,
      errorCorrectionLevel: "L", // no centre logo now -> lightest, least dense QR
      width: 640,
      color: { dark: ORANGE, light: "#ffffff" }, // orange QR on white
    }).then((qr) => {
      setSvg(template.replaceAll("{{UFID}}", code).replace("{{QR}}", qr));
    });
  }, [code]);

  const download = () => {
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const scale = 3; // A5 @ ~ crisp
      const c = document.createElement("canvas");
      c.width = 560 * scale;
      c.height = 794 * scale;
      const ctx = c.getContext("2d")!;
      ctx.clearRect(0, 0, c.width, c.height);
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
