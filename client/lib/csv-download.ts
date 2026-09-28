import { api } from "@/lib/api-client";

/**
 * Downloads a CSV export from a protected endpoint.
 *
 * Auth tokens cannot be sent through a plain <a href> navigation, so we fetch
 * the blob with the shared axios instance (Authorization header attached by
 * its request interceptor) and trigger a client-side download instead.
 */
export async function downloadCsvExport(url: string, filename: string): Promise<void> {
  const response = await api.get(url, { responseType: "blob" });

  const contentType = (response.headers?.["content-type"] as string) || "text/csv; charset=utf-8";
  const blob = new Blob([response.data as BlobPart], { type: contentType });

  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(objectUrl);
}

export function csvFilename(prefix: string): string {
  return `${prefix}-${new Date().toISOString().slice(0, 10)}.csv`;
}
