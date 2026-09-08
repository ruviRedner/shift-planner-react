import { useRef, useState } from "react";
import { App, Button, Space } from "antd";
import { DownloadOutlined, UploadOutlined } from "@ant-design/icons";
import type { PlannerData } from "../domain/planner";
import { decodePlanner, encodePlanner } from "../storage/codec";

export function BackupControls({ data, onRestore }: { data: PlannerData; onRestore: (data: PlannerData) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { message, modal } = App.useApp();

  function download() {
    const url = URL.createObjectURL(new Blob([encodePlanner(data)], { type: "application/json;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `shift-planner-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function restore(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("קובץ הגיבוי גדול מדי. הגודל המרבי הוא 10MB.");
      const decoded = decodePlanner(await file.text());
      if (await modal.confirm({
        title: "שחזור מגיבוי", okText: "שחזר והחלף נתונים", cancelText: "ביטול",
        content: `הגיבוי כולל ${decoded.staff.length} אנשי צוות, ${Object.keys(decoded.periods).length} תקופות ו־${decoded.unavailability.length} רשומות חוסר זמינות. השחזור יחליף את הנתונים הנוכחיים. ניתן לבטל אותו באמצעות ביטול הפעולה האחרונה.`,
      })) { onRestore(decoded); void message.success("הגיבוי שוחזר"); }
    } catch (error) {
      void message.error(error instanceof SyntaxError ? "הקובץ אינו קובץ גיבוי תקין." : error instanceof Error ? error.message : "לא ניתן לקרוא את הקובץ.");
    } finally { setBusy(false); if (input.current) input.current.value = ""; }
  }

  return <Space wrap>
    <Button icon={<DownloadOutlined />} onClick={download}>הורד גיבוי</Button>
    <Button icon={<UploadOutlined />} loading={busy} onClick={() => input.current?.click()}>שחזר מגיבוי</Button>
    <input ref={input} type="file" accept=".json,application/json" hidden aria-label="קובץ גיבוי" onChange={(event) => void restore(event.target.files?.[0])} />
  </Space>;
}
