import { HttpMethod } from "@4mica/http";
import { saveBlob } from "@/lib/download";
import { httpClient } from "./client";

type Params = Record<string, string | number | boolean | undefined>;

const stamp = () => new Date().toISOString().slice(0, 10);

export const downloadCsv = async (
  url: string,
  params: Params,
  filename: string,
): Promise<void> => {
  const body = await httpClient.request<unknown>({
    url,
    method: HttpMethod.GET,
    params,
    headers: { Accept: "text/csv" },
  });
  const text = typeof body === "string" ? body : JSON.stringify(body ?? "");
  saveBlob(new Blob([text], { type: "text/csv;charset=utf-8" }), filename);
};

export const exportPayments = (params: Params) =>
  downloadCsv(
    "/me/finance/export/payments.csv",
    params,
    `payments-${stamp()}.csv`,
  );

export const exportUsage = (params: Params) =>
  downloadCsv("/me/finance/export/usage.csv", params, `usage-${stamp()}.csv`);

export const exportAuditLog = (params: Params) =>
  downloadCsv(
    "/me/organization/audit-logs/export.csv",
    params,
    `audit-log-${stamp()}.csv`,
  );
