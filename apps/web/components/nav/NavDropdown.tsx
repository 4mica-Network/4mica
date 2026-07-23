import DropdownMenuItem from "./DropdownMenuItem";
import type { NavLinkItem, NavSection } from "./navData";

const MAX_PER_COLUMN = 4;

/**
 * Split a section into balanced columns of at most `MAX_PER_COLUMN` rows.
 *
 * Balancing matters more than filling: five developer links become 3 + 2 rather
 * than 4 + 1, and the seven use cases become 4 + 3 — a second use-case column
 * that sits third in the menu, next to the customer column.
 */
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
      {/* Sections sit side by side, divided by a hairline. The first section is
          the one we lead with (customers), so it reads left-to-right. */}
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
