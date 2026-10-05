import { Link } from "@4mica/ui";
import { fetchAgents } from "@stores/agent/actions";
import { fetchApiListings } from "@stores/apiListing/actions";
import { fetchDeveloper } from "@stores/developer/actions";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { fetchPaymentSummary } from "@stores/payment/actions";
import { selectUser } from "@stores/user/selector";
import { fetchWallets } from "@stores/wallet/actions";
import { useLocalStorageState } from "ahooks";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, LifeBuoy, Rocket, X } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
import { links } from "@/lib/links";
import { ChecklistItem } from "./ChecklistItem";
import { useChecklist } from "./useChecklist";

interface ChecklistPrefs {
  collapsed: boolean;
  dismissed: boolean;
  /** Which set of steps the dismissal was for. */
  version?: number;
}

/**
 * Bump whenever the steps change.
 *
 * A dismissal means "I have read these", not "never show me anything again".
 * Without a version, someone who dismissed an earlier, shorter checklist would
 * never see the steps added later — the guidance would be there and silently
 * unreachable, which is worse than not having written it.
 */
export const CHECKLIST_VERSION = 2;

const DEFAULT_PREFS: ChecklistPrefs = {
  collapsed: false,
  dismissed: false,
  version: CHECKLIST_VERSION,
};

/**
 * A dismissal only silences the steps it was made against, so adding a step
 * brings the widget back once. Completing everything hides it for good, which
 * needs no version.
 */
export const shouldShowChecklist = (
  prefs: ChecklistPrefs,
  done: number,
  total: number,
): boolean => {
  if (done === total) {
    return false;
  }

  return !(prefs.dismissed && prefs.version === CHECKLIST_VERSION);
};

/**
 * Sits at z-40, below react-toastify's 9999 — a transient alert should be able
 * to appear over the widget, not behind it. Empty toast containers set
 * `pointerEvents: none` themselves, so the bottom-right stack does not swallow
 * clicks meant for this.
 */
export function IntegrationChecklist() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectUser);
  const { items, done, total } = useChecklist();

  // Namespaced by user id: on a shared browser, one account's dismissal must
  // not hide the widget for the next person to sign in.
  const [prefs, setPrefs] = useLocalStorageState<ChecklistPrefs>(
    `4mica:checklist:${user?.id ?? "anon"}`,
    { defaultValue: DEFAULT_PREFS },
  );

  const { collapsed, dismissed } = prefs ?? DEFAULT_PREFS;

  // The widget is mounted app-wide, so this is the one place that guarantees
  // the checklist reflects reality no matter which page the user landed on.
  useEffect(() => {
    dispatch(fetchDeveloper());
    dispatch(fetchWallets());
    dispatch(fetchApiListings());
    dispatch(fetchAgents());
    dispatch(fetchPaymentSummary());
  }, [dispatch]);

  if (!shouldShowChecklist(prefs ?? DEFAULT_PREFS, done, total)) {
    return null;
  }

  return (
    <div className="fixed right-6 bottom-6 z-40 w-[320px] max-w-[calc(100vw-3rem)]">
      <div className="overflow-hidden rounded-lg border border-overlay/10 bg-surface shadow-lg">
        <div className="flex items-center gap-2 px-4 py-3">
          <Rocket className="h-4 w-4 shrink-0 text-brand" />

          <button
            type="button"
            onClick={() =>
              setPrefs({
                collapsed: !collapsed,
                dismissed,
                version: CHECKLIST_VERSION,
              })
            }
            aria-expanded={!collapsed}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-ink-strong text-sm">
                {t("checklist.title")}
              </span>
              <span className="block text-ink-muted text-xs tabular-nums">
                {t("checklist.progress", { done, total })}
              </span>
            </span>

            <ChevronDown
              className={`h-4 w-4 shrink-0 text-ink-subtle transition-transform duration-200 ${
                collapsed ? "" : "rotate-180"
              }`}
            />
          </button>

          <button
            type="button"
            onClick={() =>
              setPrefs({
                collapsed,
                dismissed: true,
                version: CHECKLIST_VERSION,
              })
            }
            aria-label={t("checklist.dismiss")}
            className="shrink-0 rounded-md p-1 text-ink-subtle transition-colors hover:text-ink-strong"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              key="body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden"
            >
              {/* Capped so eight items cannot run off a short viewport; the
                  header and footer stay put while the list scrolls. */}
              <ul className="flex max-h-[45vh] flex-col overflow-y-auto border-overlay/10 border-t px-4 py-2">
                {items.map((item) => (
                  <ChecklistItem key={item.id} item={item} />
                ))}
              </ul>

              <div className="flex items-center justify-between gap-2 border-overlay/10 border-t bg-overlay/5 px-4 py-2.5">
                <span className="flex items-center gap-1.5 text-ink-muted text-xs">
                  <LifeBuoy className="h-3.5 w-3.5" />
                  {t("checklist.help")}
                </span>

                <span className="flex items-center gap-3 text-xs">
                  <NavLink
                    to="/help"
                    className="text-ink-body transition-colors hover:text-ink-strong"
                  >
                    {t("checklist.helpCenter")}
                  </NavLink>
                  <Link href={links.mailto.support} variant="accent">
                    {t("checklist.contactSupport")}
                  </Link>
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
