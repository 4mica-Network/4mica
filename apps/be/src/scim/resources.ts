import { config } from "@config/index";

export const USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
export const GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";
export const LIST_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:ListResponse";
const SERVICE_PROVIDER_SCHEMA =
  "urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig";
const RESOURCE_TYPE_SCHEMA =
  "urn:ietf:params:scim:schemas:core:2.0:ResourceType";
const SCHEMA_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Schema";

export const MAX_RESULTS = 200;

export const scimBase = () => `${config.publicApiUrl}/scim/v2`;

const location = (kind: "Users" | "Groups", id: string) =>
  `${scimBase()}/${kind}/${id}`;

export interface UserView {
  id: string;
  email: string | null;
  name: string | null;
  externalId: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  groups: { id: string; displayName: string }[];
}

export const toScimUser = (user: UserView) => ({
  schemas: [USER_SCHEMA],
  id: user.id,
  ...(user.externalId ? { externalId: user.externalId } : {}),
  userName: user.email ?? "",
  ...(user.name
    ? { name: { formatted: user.name }, displayName: user.name }
    : {}),
  emails: user.email
    ? [{ value: user.email, type: "work", primary: true }]
    : [],
  active: user.active,
  groups: user.groups.map((group) => ({
    value: group.id,
    display: group.displayName,
    $ref: location("Groups", group.id),
  })),
  meta: {
    resourceType: "User",
    created: user.createdAt.toISOString(),
    lastModified: user.updatedAt.toISOString(),
    location: location("Users", user.id),
  },
});

export interface GroupView {
  id: string;
  displayName: string;
  externalId: string | null;
  createdAt: Date;
  updatedAt: Date;
  members: { id: string; display: string | null }[] | null;
}

export const toScimGroup = (group: GroupView) => ({
  schemas: [GROUP_SCHEMA],
  id: group.id,
  displayName: group.displayName,
  ...(group.externalId ? { externalId: group.externalId } : {}),
  ...(group.members
    ? {
        members: group.members.map((member) => ({
          value: member.id,
          ...(member.display ? { display: member.display } : {}),
          $ref: location("Users", member.id),
        })),
      }
    : {}),
  meta: {
    resourceType: "Group",
    created: group.createdAt.toISOString(),
    lastModified: group.updatedAt.toISOString(),
    location: location("Groups", group.id),
  },
});

export const listResponse = <T>(
  resources: T[],
  totalResults: number,
  startIndex: number,
) => ({
  schemas: [LIST_SCHEMA],
  totalResults,
  startIndex,
  itemsPerPage: resources.length,
  Resources: resources,
});

export const serviceProviderConfig = () => ({
  schemas: [SERVICE_PROVIDER_SCHEMA],
  documentationUri: "https://4mica.io/docs",
  patch: { supported: true },
  bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
  filter: { supported: true, maxResults: MAX_RESULTS },
  changePassword: { supported: false },
  sort: { supported: false },
  etag: { supported: false },
  authenticationSchemes: [
    {
      type: "oauthbearertoken",
      name: "OAuth Bearer Token",
      description:
        "A SCIM token created in the 4mica dashboard, sent as `Authorization: Bearer 4mica_scim_…`.",
      primary: true,
    },
  ],
  meta: {
    resourceType: "ServiceProviderConfig",
    location: `${scimBase()}/ServiceProviderConfig`,
  },
});

const resourceType = (id: "User" | "Group") => ({
  schemas: [RESOURCE_TYPE_SCHEMA],
  id,
  name: id,
  endpoint: id === "User" ? "/Users" : "/Groups",
  description: id === "User" ? "Organization members" : "Role-mapped groups",
  schema: id === "User" ? USER_SCHEMA : GROUP_SCHEMA,
  schemaExtensions: [],
  meta: {
    resourceType: "ResourceType",
    location: `${scimBase()}/ResourceTypes/${id}`,
  },
});

export const resourceTypes = () => [
  resourceType("User"),
  resourceType("Group"),
];

export const findResourceType = (id: string) =>
  resourceTypes().find((type) => type.id === id) ?? null;

const attribute = (name: string, overrides: Record<string, unknown> = {}) => ({
  name,
  type: "string",
  multiValued: false,
  required: false,
  caseExact: false,
  mutability: "readWrite",
  returned: "default",
  uniqueness: "none",
  ...overrides,
});

const userAttributes = [
  attribute("userName", { required: true, uniqueness: "server" }),
  attribute("externalId", { caseExact: true }),
  attribute("displayName"),
  attribute("name", {
    type: "complex",
    subAttributes: [
      attribute("formatted"),
      attribute("givenName"),
      attribute("familyName"),
    ],
  }),
  attribute("active", { type: "boolean" }),
  attribute("emails", {
    type: "complex",
    multiValued: true,
    subAttributes: [
      attribute("value"),
      attribute("type"),
      attribute("primary", { type: "boolean" }),
    ],
  }),
  attribute("groups", {
    type: "complex",
    multiValued: true,
    mutability: "readOnly",
    subAttributes: [
      attribute("value", { mutability: "readOnly" }),
      attribute("display", { mutability: "readOnly" }),
      attribute("$ref", { type: "reference", mutability: "readOnly" }),
    ],
  }),
];

const groupAttributes = [
  attribute("displayName", { required: true, uniqueness: "server" }),
  attribute("externalId", { caseExact: true }),
  attribute("members", {
    type: "complex",
    multiValued: true,
    subAttributes: [
      attribute("value", { mutability: "immutable" }),
      attribute("display", { mutability: "readOnly" }),
      attribute("$ref", { type: "reference", mutability: "immutable" }),
    ],
  }),
];

const schemaDocument = (id: string, name: string, attributes: unknown[]) => ({
  schemas: [SCHEMA_SCHEMA],
  id,
  name,
  description: name === "User" ? "User Account" : "Group",
  attributes,
  meta: { resourceType: "Schema", location: `${scimBase()}/Schemas/${id}` },
});

export const schemaDocuments = () => [
  schemaDocument(USER_SCHEMA, "User", userAttributes),
  schemaDocument(GROUP_SCHEMA, "Group", groupAttributes),
];

export const findSchemaDocument = (id: string) =>
  schemaDocuments().find((schema) => schema.id === id) ?? null;
