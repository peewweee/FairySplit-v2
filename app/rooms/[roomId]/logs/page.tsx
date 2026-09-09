import { LogsHistoryScreen } from "@/components/fairy/logs-history-screen";

export default async function LogsHistoryPage({ params }: PageProps<"/rooms/[roomId]/logs">) {
  const { roomId } = await params;
  return <LogsHistoryScreen roomId={roomId} />;
}
