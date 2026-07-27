import { SignupForm } from "@/components/auth/SignupForm";

export default function SignupPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center p-8 gap-6">
      <h1 className="text-2xl font-semibold">Crear cuenta</h1>
      <SignupForm />
    </main>
  );
}
