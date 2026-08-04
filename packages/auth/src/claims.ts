const asString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

export interface ProfileClaims {
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
}

export const extractProfile = (
  claims: Readonly<Record<string, unknown>>,
): ProfileClaims => ({
  email: asString(claims.email),
  name: asString(claims.name),
  avatarUrl: asString(claims.image) ?? asString(claims.image_url),
});
