import { useEffect, useState } from "react";
import { Alert, App, Button, Checkbox, Modal, Space, Tag, Typography } from "antd";
import { PictureOutlined } from "@ant-design/icons";
import type { PlannerData } from "../domain/planner";
import { publicationReview } from "../domain/publication";
import { renderScheduleImage } from "../export/scheduleImage";

export function PublishPanel({ data, onPublish }: { data: PlannerData; onPublish: (update: (data: PlannerData) => PlannerData, label: string) => void }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [allowIssues, setAllowIssues] = useState(false);
  const [preview, setPreview] = useState<{ url: string; blob: Blob; source: string; draft: boolean } | null>(null);
  const { message } = App.useApp();
  const review = publicationReview(data), issues = review.empty.length + review.conflicts.length;
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);
  const source = JSON.stringify({ ...data, publications: undefined });
  const current = preview?.source === source;
  async function generate() {
    setBusy(true);
    try { const draft = issues > 0 && !allowIssues; const blob = await renderScheduleImage(data, draft); setPreview({ blob, url: URL.createObjectURL(blob), source, draft }); }
    catch (error) { void message.error(error instanceof Error ? error.message : "יצירת התמונה נכשלה"); }
    finally { setBusy(false); }
  }
  function remember() {
    if (preview?.draft) return;
    onPublish((latest) => ({ ...latest, publications: { ...latest.publications, [latest.currentStart]: review.snapshot } }), "שמירת גרסה לפרסום");
  }
  function download() {
    if (!preview || !current) return;
    const anchor = document.createElement("a"); anchor.href = preview.url; anchor.download = `schedule-${data.currentStart}${preview.draft ? "-draft" : ""}.png`;
    document.body.append(anchor); anchor.click(); anchor.remove(); remember();
  }
  async function share() {
    if (!preview || !current) return;
    const file = new File([preview.blob], `schedule-${data.currentStart}.png`, { type: "image/png" });
    if (!navigator.canShare?.({ files: [file] })) { void message.info("השיתוף הישיר אינו זמין בדפדפן הזה. הורידו את התמונה וצרפו אותה לוואטסאפ."); return; }
    try { await navigator.share({ files: [file], title: "סידור משמרות" }); remember(); }
    catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) void message.error("השיתוף לא הושלם"); }
  }
  return <>
    <Button icon={<PictureOutlined />} onClick={() => { setOpen(true); setPreview(null); setAllowIssues(false); }}>מוכן לפרסום</Button>
    <Modal title="בדיקה ויצירת סידור לשיתוף" open={open} width={980} onCancel={() => setOpen(false)} footer={<Button onClick={() => setOpen(false)}>סגור</Button>}>
      <Space wrap><Tag color={issues ? "orange" : "green"}>{issues ? "נדרשת בדיקה" : "הסידור מוכן"}</Tag><Tag>{review.empty.length} משמרות ריקות</Tag><Tag>{review.conflicts.length} התנגשויות</Tag><Tag>{review.changed.length} משמרות השתנו מאז הפרסום הקודם</Tag></Space>
      {review.notesChanged && <Typography.Paragraph>גם ההערות השתנו מאז הפרסום הקודם.</Typography.Paragraph>}
      {review.laundryChanged.length > 0 && <Typography.Paragraph>הכביסות השתנו ב־{review.laundryChanged.length} ימים מאז הפרסום הקודם.</Typography.Paragraph>}
      <Typography.Paragraph type="secondary">התמונה כוללת את הסידור וההערות השבועיות, ללא הערות חוסר זמינות. משמרות שהשתנו מודגשות בצהוב. הורדה כגרסה לפרסום שומרת נקודת השוואה לפעם הבאה.</Typography.Paragraph>
      {issues > 0 && <><Alert type="warning" title="יש חוסרים או התנגשויות. אפשר להוריד טיוטה לבדיקה, או לאשר פרסום בכל זאת." /><Checkbox checked={allowIssues} onChange={(event) => { setAllowIssues(event.target.checked); setPreview(null); }}>בדקתי את החוסרים וההתנגשויות ואני מאשר/ת פרסום בכל זאת</Checkbox></>}
      <Space wrap className="auto-options"><Button type="primary" loading={busy} onClick={() => void generate()}>צור תמונה לתצוגה מקדימה</Button><Button disabled={!preview || !current} onClick={download}>{preview?.draft ? "הורד טיוטה" : "הורד וסמן כגרסה לפרסום"}</Button><Button disabled={!preview || !current} onClick={() => void share()}>שתף תמונה</Button></Space>
      {preview && <img src={preview.url} alt="תצוגה מקדימה של סידור המשמרות לשיתוף" style={{ width: "100%", borderRadius: 12 }} />}
    </Modal>
  </>;
}
