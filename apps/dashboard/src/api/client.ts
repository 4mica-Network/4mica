import { HttpClient } from "@4mica/http";

export { HttpError, HttpMethod, setAuthTokenProvider } from "@4mica/http";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export const httpClient = new HttpClient(API_URL);
