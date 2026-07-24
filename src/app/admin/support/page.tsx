import { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminSupportTicketsScreen } from "@/components/admin/AdminSupportTicketsScreen";

export const metadata: Metadata = {
  title: "Support Chats",
};

export default function AdminSupportPage() {
  return (
    <AdminShell>
      <AdminSupportTicketsScreen />
    </AdminShell>
  );
}
