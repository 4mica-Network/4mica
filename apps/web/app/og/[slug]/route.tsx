import {
  DEFAULT_PAGE_PATH,
  FALLBACK_METADATA,
  KNOWN_PAGE_PATHS,
  normalizePath,
  resolvePageMetadata,
} from "@seo/pageMetaData";
import { SITE_NAME } from "@seo/shared";
import { ImageResponse } from "next/og";
import type { CSSProperties } from "react";

export const dynamic = "force-static";

const OG_SIZE = { width: 1200, height: 630 };
const TITLE_LIMIT = 74;
const DESCRIPTION_LIMIT = 170;

const COLORS = {
  surfaceDeep: "rgb(6, 9, 15)",
  surfaceSolid: "rgb(5, 11, 29)",
  inkStrong: "rgb(231, 241, 255)",
  inkBody: "rgb(200, 215, 242)",
  inkMuted: "rgb(156, 183, 232)",
  brand: "rgb(123, 203, 255)",
  brandStrong: "rgb(60, 174, 245)",
  brandTeal: "rgb(72, 201, 176)",
  brandDeep: "rgb(30, 77, 216)",
  brandSoft: "rgb(163, 255, 214)",
  border: "rgba(255, 255, 255, 0.1)",
};

type MetadataTitle = NonNullable<typeof FALLBACK_METADATA.title>;

type RouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

const truncate = (value: string, limit: number) =>
  value.length > limit ? `${value.slice(0, limit - 1)}...` : value;

const getTextTitle = (title: MetadataTitle | null | undefined) => {
  if (typeof title === "string") return title;
  if (title && typeof title === "object" && "default" in title) {
    const defaultTitle = title.default;
    return typeof defaultTitle === "string" ? defaultTitle : undefined;
  }

  return undefined;
};

const getDescription = (description: unknown) =>
  typeof description === "string" ? description : undefined;

const pathToSlug = (path: string) =>
  path === "/" ? "home" : path.replace(/^\/+|\/+$/g, "").replace(/\//g, "-");

const slugToPath = new Map(
  KNOWN_PAGE_PATHS.map((path) => [pathToSlug(path), path]),
);

const baseContainerStyles: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  width: `${OG_SIZE.width}px`,
  height: `${OG_SIZE.height}px`,
  position: "relative",
  overflow: "hidden",
  background: COLORS.surfaceDeep,
  color: COLORS.inkBody,
  padding: "68px 74px",
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

export function generateStaticParams() {
  return KNOWN_PAGE_PATHS.map((path) => ({ slug: pathToSlug(path) }));
}

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { slug } = await params;
    const pagePath = slugToPath.get(slug);
    const normalizedPath = normalizePath(pagePath) ?? DEFAULT_PAGE_PATH;
    const metadata = resolvePageMetadata(normalizedPath);

    const title = truncate(
      metadata.openGraph?.title?.toString() ??
        getTextTitle(metadata.title) ??
        getTextTitle(FALLBACK_METADATA.title) ??
        SITE_NAME,
      TITLE_LIMIT,
    );
    const description = truncate(
      getDescription(metadata.openGraph?.description) ??
        getDescription(metadata.description) ??
        "",
      DESCRIPTION_LIMIT,
    );
    const _pathLabel = normalizedPath === "/" ? "4mica.io" : normalizedPath;
    const logoUrl = new URL("/assets/og-logo.png", request.url).toString();

    return new ImageResponse(
      <div style={baseContainerStyles}>
        <div
          style={{
            display: "flex",
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(135deg, rgba(30,77,216,0.34), rgba(5,11,29,0.96) 46%, rgba(72,201,176,0.18))",
          }}
        />
        <div
          style={{
            display: "flex",
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(rgba(123,203,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(123,203,255,0.08) 1px, transparent 1px)",
            backgroundSize: "72px 72px",
            maskImage:
              "linear-gradient(135deg, rgba(0,0,0,0.75), rgba(0,0,0,0.12) 70%)",
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "flex-start",
          }}
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            <img
              src={logoUrl}
              alt=""
              width={128}
              height={128}
              style={{ borderRadius: 14, objectFit: "cover" }}
            />
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            flex: 1,
            gap: 24,
            position: "relative",
            maxWidth: 920,
          }}
        >
          <div
            style={{
              display: "flex",
              width: 96,
              height: 4,
              borderRadius: 999,
              background: `linear-gradient(90deg, ${COLORS.brandDeep}, ${COLORS.brandStrong}, ${COLORS.brandTeal})`,
            }}
          />
          <h1
            style={{
              margin: 0,
              fontSize: 52,
              lineHeight: 0.98,
              fontWeight: 800,
              letterSpacing: 0,
              color: COLORS.inkStrong,
            }}
          >
            {title}
          </h1>
          {description ? (
            <p
              style={{
                margin: 0,
                fontSize: 32,
                lineHeight: 1.24,
                fontWeight: 500,
                color: COLORS.inkBody,
                maxWidth: 930,
              }}
            >
              {description}
            </p>
          ) : null}
        </div>
      </div>,
      OG_SIZE,
    );
  } catch {
    return new ImageResponse(
      <div
        style={{
          ...baseContainerStyles,
          alignItems: "center",
          justifyContent: "center",
          fontSize: 72,
          fontWeight: 800,
        }}
      >
        {SITE_NAME}
      </div>,
      { ...OG_SIZE, status: 500 },
    );
  }
}
