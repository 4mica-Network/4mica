import { NotFoundView } from "@/components/NotFoundView";
import { TopBar } from "@/components/TopBar";

export default function ProfileNotFound() {
  return (
    <>
      <TopBar floating={true} />
      <NotFoundView embedded />
    </>
  );
}
