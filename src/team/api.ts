export async function api<T>(path: string, input?: unknown, method = "POST"): Promise<T> {
  const response = await fetch(`/api${path}`, input === undefined ? { credentials: "same-origin", cache: "no-store" } : {
    method, credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  });
  let data;
  try { data = await response.json(); } catch { throw new Error("שרת הצוות אינו זמין. הפעילו npm run dev:full לצורך בדיקה מקומית."); }
  if (!response.ok) throw new Error(data.error ?? "הפעולה נכשלה");
  return data as T;
}
