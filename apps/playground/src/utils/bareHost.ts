export const bareHost = (url: string): string =>
  url.replace(/^https?:\/\//, "").replace(/\/+$/, "");
