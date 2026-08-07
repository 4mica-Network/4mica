import { ImageResponse } from "next/og";
import { parseUsername } from "@/schema/params";
import { getPublicProfile } from "@/services/profile";
import { SITE_NAME } from "@/services/seo";
import { initials } from "@/utils/initials";

// Per-user, so it cannot be force-static like apps/web's OG route.
export const revalidate = 3600;

const OG_SIZE = { width: 1200, height: 630 };
const NAME_LIMIT = 46;
const BIO_LIMIT = 150;

/** Same values as apps/web/app/og/[slug]/route.tsx, for visual consistency. */
const COLORS = {
  surfaceDeep: "rgb(6, 9, 15)",
  inkStrong: "rgb(231, 241, 255)",
  inkBody: "rgb(200, 215, 242)",
  inkMuted: "rgb(156, 183, 232)",
  brand: "rgb(123, 203, 255)",
  brandTeal: "rgb(72, 201, 176)",
  border: "rgba(255, 255, 255, 0.1)",
};

const truncate = (value: string, limit: number) =>
  value.length > limit ? `${value.slice(0, limit - 1)}…` : value;

interface RouteContext {
  params: Promise<{ username: string }>;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const username = parseUsername((await params).username);
  const result = username ? await getPublicProfile(username) : null;

  // A gated profile gets the generic 4Mica card. Rendering the real name here
  // would leak it to anyone who can guess a handle, defeating the visibility
  // gate that the page itself enforces.
  const isPublic = result?.profile.isPublished ?? false;
  const profile = isPublic ? result?.profile : undefined;

  const displayName = profile
    ? truncate(profile.name || profile.username, NAME_LIMIT)
    : SITE_NAME;
  const handle = profile ? `@${profile.username}` : "4mica.io";
  const blurb = profile
    ? truncate(
        profile.bio ||
          profile.description ||
          "Agents and APIs on the 4Mica credit layer.",
        BIO_LIMIT,
      )
    : "Credit-layer infrastructure for the agentic economy.";

  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        width: `${OG_SIZE.width}px`,
        height: `${OG_SIZE.height}px`,
        padding: "80px",
        background: COLORS.surfaceDeep,
        backgroundImage: `radial-gradient(circle at 18% 12%, rgba(60,174,245,0.28), transparent 55%), radial-gradient(circle at 88% 90%, rgba(72,201,176,0.18), transparent 50%)`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "28px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "132px",
            height: "132px",
            borderRadius: "66px",
            border: `1px solid ${COLORS.border}`,
            background: "rgba(123,203,255,0.12)",
            color: COLORS.brand,
            fontSize: "48px",
            fontWeight: 600,
          }}
        >
          {profile
            ? initials(profile.name, profile.username)
            : String.fromCodePoint(0x34)}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div
            style={{
              color: COLORS.inkStrong,
              fontSize: "60px",
              fontWeight: 600,
              lineHeight: 1.1,
            }}
          >
            {displayName}
          </div>
          <div style={{ color: COLORS.brand, fontSize: "32px" }}>{handle}</div>
        </div>
      </div>

      <div
        style={{
          marginTop: "44px",
          color: COLORS.inkBody,
          fontSize: "30px",
          lineHeight: 1.4,
          maxWidth: "980px",
        }}
      >
        {blurb}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          marginTop: "auto",
          paddingTop: "48px",
          color: COLORS.inkMuted,
          fontSize: "24px",
        }}
      >
        <div
          style={{
            width: "10px",
            height: "10px",
            borderRadius: "5px",
            background: COLORS.brandTeal,
          }}
        />
        {SITE_NAME}
      </div>
    </div>,
    OG_SIZE,
  );
}
