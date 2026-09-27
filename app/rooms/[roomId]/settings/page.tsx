import { RoomSettingsScreen } from "@/components/fairy/room-settings-screen";
import { requireUser } from "@/lib/auth/dal";

export default async function RoomSettingsPage({
  params,
}: PageProps<"/rooms/[roomId]/settings">) {
  await requireUser();
  const { roomId } = await params;
  return <RoomSettingsScreen roomId={roomId} />;
}
