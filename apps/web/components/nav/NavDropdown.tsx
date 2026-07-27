import DropdownMenuItem from "./DropdownMenuItem";
import type { NavLinkItem, NavSection } from "./navData";

const MAX_PER_COLUMN = 4;

function columnsFor(items: NavLinkItem[]): NavLinkItem[][] {
  const columnCount = Math.ceil(items.length / MAX_PER_COLUMN);
  if (columnCount <= 1) return [items];

  const size = Math.ceil(items.length / columnCount);
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
    <div className="w-max max-w-[min(96vw,72rem)] rounded-xl border border-overlay/10 bg-surface-deep/95 p-4 shadow-2xl backdrop-blur-sm">
      <div className="flex flex-wrap items-stretch gap-x-3 gap-y-4">
        {sections.map((section, index) => (
          <div
            key={section.title ?? "section"}
            className={
              index === 0
                ? "min-w-0"
                : "min-w-0 border-overlay/10 lg:border-l lg:pl-3"
            }
          >
            {section.title && (
              <p className="mb-1 px-2.5 text-ink-subtle text-md uppercase tracking-wider">
                {section.title}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {columnsFor(section.items).map((column) => (
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
