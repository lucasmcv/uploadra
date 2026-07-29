"use client";

import { useEffect, useState } from "react";

interface BillingStatus {
  subscriptionStatus: string | null;
  subscribedPriceCents: number | null;
  currentPeriodEnd: string | null;
  paymentGraceUntil: string | null;
  requiredTierCents: number;
}

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("es-AR", { style: "currency", currency: "ARS" });
}

export default function BillingPage() {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(false);
  // Date.now() is an impure call — capturing it once via a lazy useState
  // initializer keeps the render body itself pure.
  const [now] = useState(() => Date.now());

  useEffect(() => {
    fetch("/api/billing/status")
      .then((res) => res.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  async function startCheckout() {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setLoading(false);
    }
  }

  async function openPortal() {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setLoading(false);
    }
  }

  if (!status) {
    return <div className="max-w-lg">Cargando...</div>;
  }

  const isActive = status.subscriptionStatus === "active" || status.subscriptionStatus === "trialing";
  const inGrace = status.paymentGraceUntil && new Date(status.paymentGraceUntil).getTime() > now;

  return (
    <div className="max-w-lg flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Facturación</h1>

      {status.requiredTierCents === 0 ? (
        <p className="text-sm text-gray-600">
          La plataforma todavía está en su etapa gratuita — no hace falta suscribirse.
        </p>
      ) : (
        <>
          <p className="text-sm">
            Cuota mensual actual de la plataforma:{" "}
            <span className="font-medium">{formatCents(status.requiredTierCents)}</span>
          </p>

          {isActive ? (
            <div className="border rounded p-4 flex flex-col gap-2">
              <p className="text-sm text-green-700 font-medium">Suscripción activa</p>
              {status.subscribedPriceCents !== null && (
                <p className="text-sm text-gray-600">
                  Pagando: {formatCents(status.subscribedPriceCents)}/mes
                </p>
              )}
              {status.currentPeriodEnd && (
                <p className="text-sm text-gray-600">
                  Renueva: {new Date(status.currentPeriodEnd).toLocaleDateString("es-AR")}
                </p>
              )}
              <button
                type="button"
                onClick={openPortal}
                disabled={loading}
                className="self-start bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-50"
              >
                Gestionar suscripción
              </button>
            </div>
          ) : (
            <div className="border rounded p-4 flex flex-col gap-2">
              {inGrace && status.paymentGraceUntil && (
                <p className="text-sm text-amber-700">
                  Tenés hasta el {new Date(status.paymentGraceUntil).toLocaleDateString("es-AR")} para
                  suscribirte antes de perder acceso a subir contenido nuevo.
                </p>
              )}
              <p className="text-sm text-gray-600">No tenés una suscripción activa.</p>
              <button
                type="button"
                onClick={startCheckout}
                disabled={loading}
                className="self-start bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-50"
              >
                Suscribirme
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
