import { LogsHistoryScreen } from "@/components/fairy/logs-history-screen";
import { requireUser } from "@/lib/auth/dal";

export default async function LogsHistoryPage({ params }: PageProps<"/rooms/[roomId]/logs">) {
  await requireUser();
  const { roomId } = await params;
  return <LogsHistoryScreen roomId={roomId} />;
}
