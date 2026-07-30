"use client";

/** The "how to get your own Gemini key" steps, shared between the Settings
 * page and anywhere the platform's shared quota runs out and needs to
 * offer the same escape hatch right at the point of failure. */
export function GeminiKeyInstructions() {
  return (
    <div className="text-sm text-gray-700 bg-gray-50 border rounded p-4 flex flex-col gap-2">
      <p className="font-semibold text-gray-800">Cómo conseguir tu clave (4 pasos):</p>
      <ol className="list-decimal list-inside flex flex-col gap-1.5 ml-1">
        <li>
          Hacé clic acá para abrir tu página de clave:{" "}
          <button
            type="button"
            onClick={() => window.open("https://aistudio.google.com/apikey", "_blank")}
            className="text-blue-600 underline font-medium"
          >
            Obtener clave de Gemini
          </button>
        </li>
        <li>Si te pide iniciar sesión, entrá con tu cuenta de Google (la misma de Gmail).</li>
        <li>
          Hacé clic en el botón <strong>&quot;Crear clave de API&quot;</strong>.
        </li>
        <li>Copiá el código y pegalo en Configuración → Clave de Gemini.</li>
      </ol>
    </div>
  );
}
