import { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminReportsHub } from "@/components/admin/AdminReportsHub";

export const metadata: Metadata = {
  title: "Reports",
};

export default function AdminReportsPage() {
  return (
    <AdminShell>
      <AdminReportsHub />
    </AdminShell>
  );
}
