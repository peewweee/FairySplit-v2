import { RoomSettingsScreen } from "@/components/fairy/room-settings-screen";

export default async function RoomSettingsPage({
  params,
}: PageProps<"/rooms/[roomId]/settings">) {
  const { roomId } = await params;
  return <RoomSettingsScreen roomId={roomId} />;
}
