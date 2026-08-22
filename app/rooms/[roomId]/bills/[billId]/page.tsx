import { BillScreen } from "@/components/fairy/bill-screen";

export default async function BillPage({ params }: PageProps<"/rooms/[roomId]/bills/[billId]">) {
  const { roomId, billId } = await params;
  return <BillScreen roomId={roomId} billId={billId} />;
}
