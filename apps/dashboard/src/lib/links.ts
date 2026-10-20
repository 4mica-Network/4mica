import { LinkConfig } from "@4mica/url";

export const links = new LinkConfig({
  VITE_BASE_URL: import.meta.env.VITE_BASE_URL,
  VITE_APP_URL: import.meta.env.VITE_APP_URL,
}).links;
