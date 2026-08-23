"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * Renders a QR code encoding a plain https URL — any phone's stock camera
 * app can already scan that, so this is the only QR-specific code the app
 * needs; the "scanning" side is just whatever camera app the other person
 * already has, landing on `/parear` (see `buildPairingUrl` in groupRuns.ts).
 */
export function PairingQrCode({ url, className = "" }: { url: string; className?: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(url, { width: 400, margin: 1, color: { dark: "#0b0e11", light: "#ffffff" } }).then(
      (result) => {
        if (!cancelled) setDataUrl(result);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!dataUrl) {
    return <div className={`aspect-square animate-pulse rounded-2xl bg-surface ${className}`} />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- a client-generated data URL, next/image's optimizer doesn't apply.
    <img src={dataUrl} alt="QR code para parear a corrida" className={`aspect-square rounded-2xl bg-white p-3 ${className}`} />
  );
}
