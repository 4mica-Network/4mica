import Link from "next/link";
import NavDropdown from "./NavDropdown";
import { NAV_ITEMS } from "./navData";

export default function DesktopNav() {
  return (
    <nav className="hidden items-center gap-1 md:flex">
      {NAV_ITEMS.map((item) =>
        item.children ? (
          <div key={item.label} className="group relative">
            <button
              type="button"
              className="flex items-center gap-1 rounded-md px-3 py-2 font-medium text-ink-body text-md transition-colors group-hover:text-ink-strong"
            >
              {item.label}
              <i className="ri-arrow-down-s-line text-md transition-transform duration-200 group-hover:rotate-180" />
            </button>
            <div className="invisible absolute top-full left-1/2 z-50 -translate-x-1/3 translate-y-1 pt-2 opacity-0 transition-all duration-200 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
              <NavDropdown sections={item.children} />
            </div>
          </div>
        ) : (
          <Link
            key={item.label}
            href={item.href ?? "#"}
            className="rounded-md px-3 py-2 font-medium text-ink-body text-md transition-colors hover:text-ink-strong"
          >
            {item.label}
          </Link>
        ),
      )}
    </nav>
  );
}
