import Link from "next/link";
import { PackageX } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <AppShell>
      <div className="flex h-full items-center justify-center">
        <EmptyState
          icon={PackageX}
          title="Page not found"
          subtitle="The page you're looking for doesn't exist or has moved."
          action={
            <Link href="/">
              <Button size="lg">Back to shop</Button>
            </Link>
          }
        />
      </div>
    </AppShell>
  );
}
