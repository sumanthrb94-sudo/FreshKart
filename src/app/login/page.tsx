import { Suspense } from "react";
import { LoginScreen } from "@/components/auth/LoginScreen";
import { AuthShell } from "@/components/auth/AuthShell";
import { FullScreenLoader } from "@/components/ui/Spinner";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <AuthShell>
          <FullScreenLoader />
        </AuthShell>
      }
    >
      <LoginScreen />
    </Suspense>
  );
}
