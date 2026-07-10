import { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminPriceUpdateScreen } from "@/components/admin/AdminPriceUpdateScreen";

export const metadata: Metadata = {
  title: "Daily Price Update",
};

export default function AdminPricesPage() {
  return (
    <AdminShell>
      <AdminPriceUpdateScreen />
    </AdminShell>
  );
}
