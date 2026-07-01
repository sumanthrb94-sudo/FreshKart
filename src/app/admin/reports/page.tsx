import { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminReportScreen } from "@/components/admin/AdminReportScreen";

export const metadata: Metadata = {
  title: "Supplier Report",
};

/** Supplier order report page. */
export default function AdminReportsPage() {
  return (
    <AdminShell>
      <AdminReportScreen />
    </AdminShell>
  );
}
