"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useHeaderClose } from "../../app-shell";
import { Card, CardTitle, delay, NoticeBadge, Screen, ScreenHeader } from "../../ui";
import { usePreferences } from "@/lib/usePreferences";
import {
  startHeartRateScan,
  type HeartRateDevice,
} from "@/lib/tracking/heartRateMonitor";

const ICON_STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function HeartRateIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...ICON_STROKE}>
      <path d="M3 12h4l2-5 3 10 2-8 2 3h5" />
    </svg>
  );
}

const SCAN_TIMEOUT_MS = 15_000;

/**
 * Pairs a BLE heart rate monitor (chest strap, or a watch broadcasting the
 * standard Heart Rate Service — never an Apple Watch, which doesn't
 * broadcast this way) — separate screen from `/perfil/relogio`'s
 * HealthKit/Health Connect pairing, a completely different mechanism
 * (direct GATT connection during a run vs. reading a finished workout from
 * the OS's health store after the fact).
 *
 * Only remembers a `deviceId`/`name` here (`preferences.ts`) — actually
 * connecting during a run is `useRunTracker.ts`'s job, opportunistic and
 * best-effort, never blocking `start()`.
 */
export default function SensorPairingPage() {
  useHeaderClose("/perfil");
  const [preferences, updatePreferences] = usePreferences();
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<HeartRateDevice[]>([]);
  const scanRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    return () => {
      scanRef.current?.stop();
    };
  }, []);

  function handleScan() {
    setDevices([]);
    setScanning(true);
    scanRef.current = startHeartRateScan((device) => {
      setDevices((current) => (current.some((d) => d.deviceId === device.deviceId) ? current : [...current, device]));
    });
    window.setTimeout(() => {
      scanRef.current?.stop();
      scanRef.current = null;
      setScanning(false);
    }, SCAN_TIMEOUT_MS);
  }

  function handleStopScan() {
    scanRef.current?.stop();
    scanRef.current = null;
    setScanning(false);
  }

  function handlePair(device: HeartRateDevice) {
    handleStopScan();
    setDevices([]);
    updatePreferences({
      heartRateMonitorDeviceId: device.deviceId,
      heartRateMonitorName: device.name,
    });
  }

  function handleForget() {
    updatePreferences({ heartRateMonitorDeviceId: undefined, heartRateMonitorName: undefined });
  }

  const paired = Boolean(preferences.heartRateMonitorDeviceId);

  return (
    <>
      <ScreenHeader title="Sensor de frequência cardíaca" />

      <Screen>
        <Card
          className="pr-enter lg:rounded-none lg:border-0 lg:border-t lg:border-border lg:bg-transparent lg:p-0 lg:pt-4 lg:shadow-none"
          style={delay(20)}
        >
          <CardTitle aside={<NoticeBadge>{paired ? "pareado" : "nenhum pareado"}</NoticeBadge>}>
            Cinta ou relógio Bluetooth
          </CardTitle>
          <p className="mb-4 text-xs leading-relaxed text-muted text-pretty">
            Lê a frequência cardíaca ao vivo, durante a corrida, direto de um sensor Bluetooth
            (cinta peitoral ou relógio transmitindo em modo aberto) — diferente da leitura pós-corrida
            do Apple Health/Health Connect em{" "}
            <Link href="/perfil/relogio" className="text-accent underline underline-offset-2">
              Dados do relógio
            </Link>
            . Apple Watch não transmite nesse modo, então não aparece aqui.
          </p>

          {paired ? (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-border p-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/12 text-accent">
                  <HeartRateIcon className="h-4.5 w-4.5" />
                </span>
                <span className="min-w-0 truncate text-sm font-medium">
                  {preferences.heartRateMonitorName ?? "Sensor pareado"}
                </span>
              </div>
              <button
                type="button"
                onClick={handleForget}
                className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted hover:border-accent hover:text-foreground"
              >
                Esquecer
              </button>
            </div>
          ) : (
            <p className="text-xs text-muted">Nenhum sensor pareado ainda.</p>
          )}
        </Card>

        <Card
          className="pr-enter lg:rounded-none lg:border-0 lg:border-t lg:border-border lg:bg-transparent lg:p-0 lg:pt-4 lg:shadow-none"
          style={delay(40)}
        >
          <CardTitle>Procurar sensores</CardTitle>
          <p className="mb-4 text-xs leading-relaxed text-muted text-pretty">
            Deixe o sensor ligado e por perto antes de buscar.
          </p>
          <button
            type="button"
            onClick={scanning ? handleStopScan : handleScan}
            className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-xs font-semibold disabled:opacity-60"
          >
            {scanning ? "Parar busca" : "Buscar sensores"}
          </button>

          {scanning && devices.length === 0 && (
            <p className="mt-3 text-xs text-muted">Buscando…</p>
          )}

          {devices.length > 0 && (
            <ul className="mt-4 flex flex-col gap-2">
              {devices.map((device) => (
                <li key={device.deviceId}>
                  <button
                    type="button"
                    onClick={() => handlePair(device)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 text-left text-sm hover:border-accent"
                  >
                    <span className="min-w-0 truncate">{device.name ?? "Dispositivo sem nome"}</span>
                    <span className="shrink-0 rounded-full bg-background px-3 py-1.5 text-xs font-semibold">
                      Conectar
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Link
          href="/perfil"
          className="pr-enter flex w-full items-center justify-center rounded-xl border border-border py-3 text-sm font-medium text-muted hover:border-accent hover:text-foreground"
          style={delay(100)}
        >
          Voltar pro perfil
        </Link>
      </Screen>
    </>
  );
}
