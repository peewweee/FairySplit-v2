import { RoomScreen } from "@/components/fairy/room-screen";
import { requireUser } from "@/lib/auth/dal";

export default async function RoomPage({ params }: PageProps<"/rooms/[roomId]">) {
  await requireUser();
  const { roomId } = await params;
  return <RoomScreen roomId={roomId} />;
}
