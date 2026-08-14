import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../../lib/cn";
import { Tab } from ".";
import { TabContext } from "./context";
import type { TabsProps } from "./type";

export const TabGroup = ({
  tabs,
  defaultActiveTab,
  activeTab: controlledActiveTab,
  tabGroupPlacement = "left",
  onTabChange,
  renderContent,
  wrapperClassName = "",
  contentClassName = "",
}: TabsProps) => {
  const isControlled = controlledActiveTab !== undefined;
  const [internalActiveTab, setInternalActiveTab] = useState(
    defaultActiveTab ||
      tabs.find((t) => !t.disabled)?.id ||
      (tabs[0]?.id ?? ""),
  );
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const activeTab = isControlled ? controlledActiveTab : internalActiveTab;

  const setActiveTab = (tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab || tab.disabled) return; // Prevent activating disabled tabs
    if (!isControlled) setInternalActiveTab(tabId);
    onTabChange?.(tabId);
  };

  let placementPosition = "";
  switch (tabGroupPlacement) {
    case "left":
      placementPosition = "justify-start";
      break;
    case "center":
      placementPosition = "justify-center";
      break;
    case "right":
      placementPosition = "justify-end";
      break;
  }

  const updateScrollButtons = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollLeft, scrollWidth, clientWidth } = container;
    const maxScrollLeft = scrollWidth - clientWidth;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft < maxScrollLeft - 1);
  }, []);

  const scrollTabs = (direction: "left" | "right") => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const scrollAmount = Math.max(container.clientWidth * 0.6, 160);
    const delta = direction === "left" ? -scrollAmount : scrollAmount;
    container.scrollBy({ left: delta, behavior: "smooth" });
  };

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    updateScrollButtons();

    const handleScroll = () => updateScrollButtons();
    container.addEventListener("scroll", handleScroll);

    let resizeObserver: ResizeObserver | null = null;

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => updateScrollButtons());
      resizeObserver.observe(container);
    } else {
      window.addEventListener("resize", updateScrollButtons);
    }

    return () => {
      container.removeEventListener("scroll", handleScroll);
      if (resizeObserver) resizeObserver.disconnect();
      else window.removeEventListener("resize", updateScrollButtons);
    };
  }, [updateScrollButtons]);

  useEffect(() => {
    updateScrollButtons();
  }, [tabs, updateScrollButtons]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const activeTabElement = container.querySelector<HTMLButtonElement>(
      '[aria-selected="true"]',
    );

    if (!activeTabElement) return;

    const activeRect = activeTabElement.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    if (
      activeRect.left < containerRect.left ||
      activeRect.right > containerRect.right
    ) {
      activeTabElement.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [activeTab]);

  return (
    <TabContext.Provider value={{ activeTab, setActiveTab }}>
      <div
        className={cn(
          isControlled && "size-full",
          "flex flex-col",
          wrapperClassName,
        )}
      >
        <div className="relative">
          {canScrollLeft && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-surface-deep via-surface-deep/85 to-transparent"
            />
          )}

          {canScrollLeft && (
            <button
              type="button"
              aria-label="Scroll tabs left"
              className="absolute top-1/2 left-1 z-20 -translate-y-1/2 rounded-full bg-transparent p-1 text-ink-muted transition hover:text-ink-strong"
              onClick={() => scrollTabs("left")}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}

          <div
            ref={scrollContainerRef}
            className={cn(
              "flex touch-pan-x space-x-1 overflow-x-auto overscroll-x-contain scroll-smooth whitespace-nowrap py-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
              placementPosition,
            )}
            role="tablist"
            aria-orientation="horizontal"
          >
            {tabs.map((tab) => (
              <Tab
                key={tab.id}
                tab={tab}
                disabled={tab.disabled}
                onClick={() => setActiveTab(tab.id)}
              />
            ))}
          </div>

          {canScrollRight && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-surface-deep via-surface-deep/85 to-transparent"
            />
          )}

          {canScrollRight && (
            <button
              type="button"
              aria-label="Scroll tabs right"
              className="absolute top-1/2 right-1 z-20 -translate-y-1/2 rounded-full bg-transparent p-1 text-ink-muted transition hover:text-ink-strong"
              onClick={() => scrollTabs("right")}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}
        </div>

        {isControlled && (
          <div className={cn("size-full", contentClassName)}>
            {tabs.map((tab) =>
              activeTab === tab.id ? (
                <div
                  key={tab.id}
                  id={`panel-${tab.id}`}
                  role="tabpanel"
                  aria-labelledby={`tab-${tab.id}`}
                  className="size-full opacity-100"
                >
                  {renderContent
                    ? renderContent(tab)
                    : typeof tab.content === "function"
                      ? tab.content()
                      : (tab.content ?? null)}
                </div>
              ) : null,
            )}
          </div>
        )}
      </div>
    </TabContext.Provider>
  );
};

TabGroup.displayName = "TabGroup";
