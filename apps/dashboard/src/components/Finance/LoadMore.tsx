import { Button } from "@4mica/ui";
import { useTranslation } from "react-i18next";

export function LoadMore({
  visible,
  loading,
  onClick,
  "data-testid": testId,
}: {
  visible: boolean;
  loading: boolean;
  onClick: () => void;
  "data-testid"?: string;
}) {
  const { t } = useTranslation();
  if (!visible) {
    return null;
  }
  return (
    <div className="flex justify-center">
      <Button
        type="button"
        intent="outline"
        size="sm"
        loading={loading}
        onClick={onClick}
        data-testid={testId}
      >
        {t("finance.loadMore")}
      </Button>
    </div>
  );
}
