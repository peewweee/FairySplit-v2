import { BillScreen } from "@/components/fairy/bill-screen";
import { requireUser } from "@/lib/auth/dal";

export default async function BillPage({ params }: PageProps<"/rooms/[roomId]/bills/[billId]">) {
  await requireUser();
  const { roomId, billId } = await params;
  return <BillScreen roomId={roomId} billId={billId} />;
}
