"use client";

import { useEffect, useState } from "react";
import { GeminiKeyInstructions } from "@/components/settings/GeminiKeyInstructions";

export function GeminiKeyForm() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/gemini-key")
      .then((res) => res.json())
      .then((data) => setConfigured(Boolean(data.configured)))
      .catch(() => setConfigured(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKey.trim()) {
      setError("Pegá tu clave primero.");
      return;
    }
    setError(null);
    setSaving(true);
    const res = await fetch("/api/settings/gemini-key", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: apiKey.trim() }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "No se pudo guardar la clave.");
      return;
    }
    setConfigured(true);
    setApiKey("");
  }

  async function handleRemove() {
    if (!window.confirm("¿Quitar tu clave de Gemini? Volverás a usar la clave compartida de la plataforma.")) {
      return;
    }
    setSaving(true);
    await fetch("/api/settings/gemini-key", { method: "DELETE" });
    setSaving(false);
    setConfigured(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="border rounded p-4 flex flex-col gap-2">
        <p className="font-medium">Clave de Gemini (opcional)</p>
        <p className="text-sm text-gray-600">
          Por defecto, la plataforma genera las preguntas por vos usando su propia clave de IA — no
          tenés que hacer nada. Si querés usar la tuya propia (por ejemplo, para no compartir el
          límite diario con otros usuarios), podés configurarla acá. Es totalmente opcional.
        </p>
      </div>

      {configured === null ? (
        <p className="text-sm text-gray-500">Cargando…</p>
      ) : configured ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-green-700">✓ Tenés una clave propia configurada.</p>
          <button
            type="button"
            onClick={handleRemove}
            disabled={saving}
            className="text-sm text-red-600 underline self-start disabled:opacity-50"
          >
            {saving ? "Quitando…" : "Quitar mi clave"}
          </button>
        </div>
      ) : (
        <form onSubmit={handleSave} className="flex flex-col gap-3">
          <GeminiKeyInstructions />

          <div className="flex flex-col gap-1">
            <label htmlFor="apiKey" className="text-sm font-medium">
              Tu clave de Gemini
            </label>
            <input
              id="apiKey"
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIza..."
              className="border rounded px-3 py-2 font-mono text-sm"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="bg-black text-white rounded px-3 py-2 disabled:opacity-50 w-fit"
          >
            {saving ? "Guardando…" : "Guardar clave"}
          </button>
        </form>
      )}
    </div>
  );
}
