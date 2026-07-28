import { DocumentUploadForm } from "@/components/upload/DocumentUploadForm";

export default function DocumentUploadPage() {
  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold mb-4">Subir documento de texto</h1>
      <DocumentUploadForm />
    </div>
  );
}
