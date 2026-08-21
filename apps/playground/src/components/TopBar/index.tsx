import { TopBarActions } from "@/components/TopBar/TopBarActions";
import { getSessionIdentity } from "@/services/viewer";

export async function TopBar() {
  const identity = await getSessionIdentity();

  return (
    <div className="absolute top-4 right-4 z-20 flex justify-end sm:top-6 sm:right-8">
      <TopBarActions identity={identity} />
    </div>
  );
}
