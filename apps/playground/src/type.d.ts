declare module "*.svg" {
  import type { FC, SVGProps } from "react";

  const content: FC<SVGProps<SVGSVGElement>>;
  export default content;
}

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: "development" | "production" | "test";
      PORT?: string;
      DATABASE_URL?: string;
      LOG_LEVEL?: string;
      LOG_DIR?: string;
      REVALIDATE_SECRET?: string;
      CLERK_SECRET_KEY?: string;
      NEXT_PUBLIC_BASE_URL?: string;
      NEXT_PUBLIC_APP_URL?: string;
      NEXT_PUBLIC_ASSET_PREFIX?: string;
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?: string;
    }
  }
}

export {};
