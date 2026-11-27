import { Checkbox, Tag } from "@4mica/ui";
import {
  API_KEY_SCOPES,
  type ApiKey,
  type ApiKeyScope,
} from "@stores/developer/type";
import { useTranslation } from "react-i18next";

export function ApiKeyTags({ apiKey }: { apiKey: ApiKey }) {
  const { t } = useTranslation();
  const production = apiKey.environment === "PRODUCTION";
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      <Tag
        size="sm"
        variant={production ? "warning" : "neutral"}
        data-testid={`api-key-environment-${apiKey.id}`}
      >
        {t(production ? "environment.production" : "environment.sandbox")}
      </Tag>
      {(apiKey.scopes ?? []).map((scope) => (
        <Tag key={scope} size="sm" variant="neutral">
          {t(`apiKey.scope.${scope}`)}
        </Tag>
      ))}
    </div>
  );
}

export function ScopePicker({
  idPrefix,
  value,
  onChange,
  error,
}: {
  idPrefix: string;
  value: ApiKeyScope[];
  onChange: (scopes: ApiKeyScope[]) => void;
  error?: string;
}) {
  const { t } = useTranslation();
  const toggle = (scope: ApiKeyScope) =>
    onChange(
      value.includes(scope)
        ? value.filter((item) => item !== scope)
        : API_KEY_SCOPES.filter(
            (item) => item === scope || value.includes(item),
          ),
    );

  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
      <legend className="mb-1 font-medium text-ink-strong text-xs">
        {t("apiKey.scopes")}
      </legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {API_KEY_SCOPES.map((scope) => (
          <Checkbox
            key={scope}
            variant="square"
            className="w-auto"
            checked={value.includes(scope)}
            onChange={() => toggle(scope)}
            data-testid={`${idPrefix}-${scope}`}
          >
            {t(`apiKey.scope.${scope}`)}
          </Checkbox>
        ))}
      </div>
      {error && <p className="text-danger text-xs">{error}</p>}
    </fieldset>
  );
}
