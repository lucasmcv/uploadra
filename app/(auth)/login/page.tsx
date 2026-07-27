import { Suspense } from "react";
import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center p-8 gap-6">
      <h1 className="text-2xl font-semibold">Ingresar</h1>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
