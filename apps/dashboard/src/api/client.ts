import { HttpClient } from "@4mica/http";
import { LOCAL_API_URL, requireTrustedApiUrl } from "./apiUrl";

export { setAuthTokenProvider } from "@4mica/http";

const API_URL = import.meta.env.PROD
  ? requireTrustedApiUrl(import.meta.env.VITE_API_URL)
  : import.meta.env.VITE_API_URL?.trim() || LOCAL_API_URL;

export const httpClient = new HttpClient(API_URL);
