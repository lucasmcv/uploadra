import { GeminiKeyForm } from "@/components/settings/GeminiKeyForm";

export default function SettingsPage() {
  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold mb-4">Configuración</h1>
      <GeminiKeyForm />
    </div>
  );
}
