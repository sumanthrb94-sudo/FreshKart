import { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminReturnsScreen } from "@/components/admin/AdminReturnsScreen";

export const metadata: Metadata = {
  title: "Returns & Refunds",
};

export default function AdminReturnsPage() {
  return (
    <AdminShell>
      <AdminReturnsScreen />
    </AdminShell>
  );
}
