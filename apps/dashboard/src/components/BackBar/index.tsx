import { Button } from "@4mica/ui";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export function BackBar({ to, label }: { to: string; label: string }) {
  return (
    <div className="sticky top-0 z-20 -mx-6 -mt-6 mb-6 bg-surface-deep px-6 pt-6 pb-3">
      <Button asChild intent="ghost" size="sm">
        <Link to={to}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          {label}
        </Link>
      </Button>
    </div>
  );
}
