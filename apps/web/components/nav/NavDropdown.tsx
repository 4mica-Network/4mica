import DropdownMenuItem from "./DropdownMenuItem";
import type { NavLinkItem, NavSection } from "./navData";

const MAX_PER_COLUMN = 3;

function chunk(items: NavLinkItem[], size: number): NavLinkItem[][] {
  const columns: NavLinkItem[][] = [];
  for (let i = 0; i < items.length; i += size) {
    columns.push(items.slice(i, i + size));
  }
  return columns;
}

export default function NavDropdown({
  sections,
  onItemClick,
}: {
  sections: NavSection[];
  onItemClick?: () => void;
}) {
  return (
    <div className="w-max max-w-[90vw] rounded-xl border border-white/10 bg-black/95 p-3 shadow-2xl backdrop-blur-sm">
      <div className="flex flex-col gap-3">
        {sections.map((section) => (
          <div key={section.title ?? "section"}>
            {section.title && (
              <p className="mb-1 px-2.5 text-ink-subtle text-md uppercase tracking-wider">
                {section.title}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {chunk(section.items, MAX_PER_COLUMN).map((column) => (
                <div
                  key={column[0]?.title ?? "column"}
                  className="flex w-max flex-col gap-0.5"
                >
                  {column.map((item) => (
                    <DropdownMenuItem
                      key={item.title}
                      item={item}
                      onClick={onItemClick}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
