import { Button, Card, EmptyState, Tag } from "@4mica/ui";
import { SCIM_BASE_URL } from "@api/security";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import {
  selectActiveOrganization,
  selectCan,
} from "@stores/organization/selector";
import {
  ORGANIZATION_ROLE,
  type OrganizationRole,
  PERMISSION,
} from "@stores/organization/type";
import {
  fetchSecurity,
  runSecurityOp,
  securityPendingKeys,
  selectIsSecurityPending,
  selectSecurityCollection,
} from "@stores/security";
import type {
  CustomRole,
  RevealedSecuritySecret,
  ScimGroup,
  ScimToken,
} from "@stores/security/type";
import { formatDate } from "@utils/format";
import { KeySquare, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmAction } from "@/components/ConfirmAction";
import { Cell, Table } from "@/components/Finance/Table";
import { Select, TextInput } from "@/components/form";
import { SettingsSection } from "@/components/layout";
import { OneTimeSecret, Unavailable } from "@/components/SecurityNotice";
import { SettingsPage } from "@/components/SettingsPage";
import { Spinner } from "@/components/Spinner";
import { useEphemeralSecret } from "@/hooks/useEphemeralSecret";
import { ROLES } from "@/pages/team/roles";

const NONE = "none";
const CUSTOM = "custom:";

export const mappingValue = (group: {
  role: OrganizationRole | null;
  customRoleId: string | null;
}) =>
  group.customRoleId ? `${CUSTOM}${group.customRoleId}` : (group.role ?? NONE);

export const mappingFromValue = (value: string) =>
  value.startsWith(CUSTOM)
    ? { role: null, customRoleId: value.slice(CUSTOM.length) }
    : value === NONE
      ? { role: null, customRoleId: null }
      : { role: value as OrganizationRole, customRoleId: null };

function TokenRow({ token }: { token: ScimToken }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const isRevoking = useAppSelector(
    selectIsSecurityPending(
      securityPendingKeys.op("revokeScimToken", token.id),
    ),
  );

  return (
    <Card
      className="flex items-center justify-between gap-3"
      data-testid={`scim-token-${token.id}`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-ink-strong text-sm">
            {token.name}
          </span>
          {token.revokedAt && (
            <Tag size="sm" variant="error">
              {t("security.scim.revoked")}
            </Tag>
          )}
        </div>
        <p className="mt-0.5 font-mono text-ink-muted text-xs">
          {token.prefix}…
        </p>
        <p className="mt-0.5 text-ink-subtle text-xs">
          {t("security.scim.tokenMeta", {
            created: formatDate(token.createdAt),
            used: formatDate(token.lastUsedAt),
          })}
        </p>
      </div>
      {!token.revokedAt && (
        <ConfirmAction
          title={t("security.scim.revokeTitle", { name: token.name })}
          description={t("security.scim.revokeBody")}
          confirmLabel={t("security.scim.revoke")}
          onConfirm={() =>
            dispatch(runSecurityOp({ op: "revokeScimToken", id: token.id }))
          }
        >
          <Button
            type="button"
            size="sm"
            intent="soft"
            loading={isRevoking}
            data-testid={`scim-token-revoke-${token.id}`}
          >
            {t("security.scim.revoke")}
          </Button>
        </ConfirmAction>
      )}
    </Card>
  );
}

function Tokens() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const tokens = useAppSelector(selectSecurityCollection("scimTokens"));
  const isCreating = useAppSelector(
    selectIsSecurityPending(securityPendingKeys.op("createScimToken")),
  );
  const { secret, reveal, clear } =
    useEphemeralSecret<RevealedSecuritySecret>();
  const [name, setName] = useState("");

  const create = () => {
    if (!name.trim() || isCreating) {
      return;
    }
    dispatch(
      runSecurityOp({ op: "createScimToken", name: name.trim() }, reveal),
    );
    setName("");
  };

  return (
    <SettingsSection
      title={t("security.scim.tokensTitle")}
      description={t("security.scim.tokensDescription")}
    >
      {secret?.kind === "scimToken" && (
        <OneTimeSecret
          title={t("security.scim.secretTitle")}
          values={[
            { label: t("security.scim.baseUrl"), value: secret.baseUrl },
            { label: t("security.scim.token"), value: secret.secret },
          ]}
          onDismiss={clear}
          data-testid="scim-secret"
        />
      )}

      <Card>
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-start"
          onSubmit={(event) => {
            event.preventDefault();
            create();
          }}
        >
          <div className="flex-1">
            <TextInput
              id="scim-token-name"
              aria-label={t("security.scim.tokenName")}
              placeholder={t("security.scim.tokenPlaceholder")}
              value={name}
              maxLength={120}
              onChange={setName}
            />
          </div>
          <Button
            type="submit"
            size="sm"
            intent="invert"
            className="btn-no-lift min-w-28 shrink-0 py-2.5"
            loading={isCreating}
            disabled={!name.trim()}
            data-testid="scim-token-create"
          >
            {t("security.scim.createToken")}
          </Button>
        </form>
        <p className="mt-3 text-ink-muted text-xs">
          {t("security.scim.baseUrlHint", { url: SCIM_BASE_URL })}
        </p>
      </Card>

      {tokens.status !== "loaded" ? (
        <Spinner size="sm" className="text-ink-subtle" />
      ) : tokens.items.length === 0 ? (
        <EmptyState
          variant="dashed"
          size="sm"
          icon={<KeySquare className="h-5 w-5" />}
          title={t("security.scim.tokensEmpty")}
          data-testid="scim-tokens-empty"
        />
      ) : (
        tokens.items.map((token) => <TokenRow key={token.id} token={token} />)
      )}
    </SettingsSection>
  );
}

function GroupRow({
  group,
  customRoles,
}: {
  group: ScimGroup;
  customRoles: CustomRole[];
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const isSaving = useAppSelector(
    selectIsSecurityPending(
      securityPendingKeys.op("updateScimGroup", group.id),
    ),
  );
  const [value, setValue] = useState(mappingValue(group));
  const [priority, setPriority] = useState(String(group.priority));

  useEffect(() => {
    setValue(mappingValue(group));
    setPriority(String(group.priority));
  }, [group]);

  const priorityValid = /^\d{1,4}$/.test(priority.trim());
  const dirty =
    value !== mappingValue(group) || priority.trim() !== String(group.priority);
  const options = [
    { value: NONE, title: t("security.scim.noMapping") },
    ...ROLES.filter((role) => role !== ORGANIZATION_ROLE.OWNER).map((role) => ({
      value: role,
      title: t(`organization.role.${role}`),
    })),
    ...customRoles.map((role) => ({
      value: `${CUSTOM}${role.id}`,
      title: t("security.scim.customRoleOption", { name: role.name }),
    })),
  ];

  return (
    <tr data-testid={`scim-group-${group.id}`}>
      <Cell>
        <span className="font-medium text-ink-strong">{group.displayName}</span>
      </Cell>
      <Cell>{group.memberCount}</Cell>
      <Cell className="min-w-44">
        <Select
          id={`scim-group-role-${group.id}`}
          aria-label={t("security.scim.mapping", { name: group.displayName })}
          value={value}
          options={options}
          onChange={setValue}
        />
      </Cell>
      <Cell className="w-28">
        <TextInput
          id={`scim-group-priority-${group.id}`}
          aria-label={t("security.scim.priority")}
          inputMode="numeric"
          value={priority}
          error={priorityValid ? undefined : t("security.scim.priorityInvalid")}
          onChange={setPriority}
        />
      </Cell>
      <Cell align="right">
        <Button
          type="button"
          size="sm"
          intent="soft"
          loading={isSaving}
          disabled={!dirty || !priorityValid}
          onClick={() =>
            dispatch(
              runSecurityOp({
                op: "updateScimGroup",
                id: group.id,
                data: {
                  ...mappingFromValue(value),
                  priority: Number(priority.trim()),
                },
              }),
            )
          }
          data-testid={`scim-group-save-${group.id}`}
        >
          {t("security.save")}
        </Button>
      </Cell>
    </tr>
  );
}

function Groups() {
  const { t } = useTranslation();
  const groups = useAppSelector(selectSecurityCollection("scimGroups"));
  const roles = useAppSelector(selectSecurityCollection("roles"));

  return (
    <SettingsSection
      title={t("security.scim.groupsTitle")}
      description={t("security.scim.groupsDescription")}
    >
      {groups.status !== "loaded" ? (
        <Spinner size="sm" className="text-ink-subtle" />
      ) : groups.items.length === 0 ? (
        <EmptyState
          variant="dashed"
          size="sm"
          icon={<UsersRound className="h-5 w-5" />}
          title={t("security.scim.groupsEmpty")}
          data-testid="scim-groups-empty"
        />
      ) : (
        <Table
          columns={[
            { label: t("security.scim.group") },
            { label: t("security.scim.members") },
            { label: t("security.scim.role") },
            { label: t("security.scim.priority") },
            { label: "", align: "right" },
          ]}
          data-testid="scim-groups"
        >
          {groups.items.map((group) => (
            <GroupRow key={group.id} group={group} customRoles={roles.items} />
          ))}
        </Table>
      )}
    </SettingsSection>
  );
}

export function ScimSettings() {
  const dispatch = useAppDispatch();
  const organization = useAppSelector(selectActiveOrganization);
  const canManage = useAppSelector(selectCan(PERMISSION.SECURITY_MANAGE));
  const available = canManage && !organization?.personal;

  useEffect(() => {
    if (available) {
      dispatch(fetchSecurity("scimTokens"));
      dispatch(fetchSecurity("scimGroups"));
      dispatch(fetchSecurity("roles"));
    }
  }, [dispatch, available]);

  return (
    <SettingsPage
      titleKey="page.settings.scim.title"
      descriptionKey="page.settings.scim.description"
    >
      {available ? (
        <>
          <Tokens />
          <Groups />
        </>
      ) : (
        <Unavailable
          personal={Boolean(organization?.personal)}
          testId="scim-unavailable"
        />
      )}
    </SettingsPage>
  );
}
