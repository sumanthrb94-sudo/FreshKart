import { OrderSuccessScreen } from "@/components/buyer/OrderSuccessScreen";

export default async function OrderSuccessPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OrderSuccessScreen id={id} />;
}
