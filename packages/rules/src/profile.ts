export interface ProfileVisibility {
  username: string | null;
  banned: boolean;
  private: boolean;
  deletedAt?: Date | string | null;
}

export const isProfileRenderable = (
  profile: ProfileVisibility | null,
): boolean =>
  profile !== null &&
  profile.username !== null &&
  (profile.deletedAt ?? null) === null &&
  profile.banned === false &&
  profile.private === false;
