import { RoomScreen } from "@/components/fairy/room-screen";

export default async function RoomPage({ params }: PageProps<"/rooms/[roomId]">) {
  const { roomId } = await params;
  return <RoomScreen roomId={roomId} />;
}
