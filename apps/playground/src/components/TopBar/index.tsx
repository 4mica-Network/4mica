import { TopBarActions } from "@/components/TopBar/TopBarActions";
import { getSessionIdentity } from "@/services/viewer";

export async function TopBar({ inline = false }: { inline?: boolean }) {
  const identity = await getSessionIdentity();

  if (inline) {
    return <TopBarActions identity={identity} />;
  }

  return (
    <div
      className="absolute top-4 right-4 z-20 flex justify-end sm:top-6 sm:right-8"
      data-top-bar
    >
      <TopBarActions identity={identity} />
    </div>
  );
}
