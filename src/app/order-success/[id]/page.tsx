import { OrderSuccessScreen } from "@/components/buyer/OrderSuccessScreen";

export default function OrderSuccessPage({ params }: { params: { id: string } }) {
  return <OrderSuccessScreen id={params.id} />;
}
