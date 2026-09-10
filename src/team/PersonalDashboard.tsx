import { useCallback, useEffect, useState } from "react";
import { Alert, App, Button, Card, DatePicker, Empty, Flex, Input, Modal, Space, Tag, Typography } from "antd";
import dayjs from "dayjs";
import { addDays, formatRange, parseDate, SHIFT_META, startOfSunday, toDateKey } from "../domain/planner";
import { calendarFile } from "../domain/calendarExport";
import { AvailabilityPanel } from "../components/AvailabilityPanel";
import { api } from "./api";
import type { PersonalData } from "./types";

export function PersonalDashboard() {
  const [start, setStart] = useState(toDateKey(startOfSunday(new Date())));
  const [data, setData] = useState<PersonalData | null>(null), [error, setError] = useState("");
  const [requesting, setRequesting] = useState<string | null>(null), [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const { message } = App.useApp();
  const load = useCallback(async () => { const next = await api<PersonalData>(`/personal?start=${start}`); setData(next); setError(""); }, [start]);
  useEffect(() => {
    let active = true;
    const poll = () => { void api<PersonalData>(`/personal?start=${start}`).then((next) => { if (active) { setData(next); setError(""); } }).catch((err) => { if (active) setError(err.message); }); };
    setData(null); poll(); const timer = window.setInterval(poll, 4000);
    return () => { active = false; window.clearInterval(timer); };
  }, [start]);
  async function action(path: string, input: unknown) {
    setBusy(true);
    try { await api(path, input); await load(); return true; }
    catch (err) { void message.error(err instanceof Error ? err.message : "הפעולה נכשלה"); return false; }
    finally { setBusy(false); }
  }
  function exportCalendar() {
    if (!data) return;
    const url = URL.createObjectURL(new Blob([calendarFile(data.staffId, data.shifts)], { type: "text/calendar;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `my-shifts-${start}.ics`; document.body.append(anchor); anchor.click(); anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="personal-dashboard">
    <div className="personal-hero"><Typography.Title level={2}>שלום{data?.name ? `, ${data.name}` : ""}</Typography.Title><Typography.Paragraph>המשמרות שלך, הזמינות ובקשות ההחלפה — במקום אחד.</Typography.Paragraph></div>
    {error && <Alert type="error" title={error} showIcon />}
    <Space wrap><Button onClick={() => setStart(toDateKey(addDays(parseDate(start), -14)))}>שבועיים קודמים</Button><DatePicker aria-label="תקופה באזור האישי" value={dayjs(start)} allowClear={false} format="DD/MM/YYYY" onChange={(date) => { if (date) setStart(toDateKey(startOfSunday(date.toDate()))); }} /><Button onClick={() => setStart(toDateKey(addDays(parseDate(start), 14)))}>שבועיים הבאים</Button><Button disabled={!data?.shifts.length} onClick={exportCalendar}>הוסף ליומן</Button></Space>
    <Typography.Text type="secondary">{formatRange(parseDate(start), addDays(parseDate(start), 13))} · הייצוא ליומן הוא של אירועי יום שלם; הוסיפו שעות ביומן לפי הצורך.</Typography.Text>
    {data && <>
      <div className="personal-shifts">{data.shifts.length ? data.shifts.map((slot) => <Card key={slot.key} size="small" title={new Date(`${slot.date}T12:00:00`).toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" })}>
        <Space direction="vertical"><Tag color={SHIFT_META[slot.shift].color}>{SHIFT_META[slot.shift].label}</Tag><Button disabled={busy || slot.date < toDateKey(new Date()) || data.requests.some((request) => request.status === "open" && request.requesterId === data.staffId && request.date === slot.date && request.shift === slot.shift)} onClick={() => { setRequesting(slot.key); setNote(""); }}>בקש החלפה</Button></Space>
      </Card>) : <Empty description="אין לך משמרות בתקופה הזו" />}</div>
      <AvailabilityPanel staff={[{ id: data.staffId, name: data.name }]} entries={data.unavailability}
        onAdd={(entry) => { void action("/availability", entry); }} onRemove={(id) => { void action("/availability/remove", { id }); }} />
      <Card title="לוח החלפות" size="small">
        <Typography.Paragraph type="secondary">הצעה להחלפה אינה משנה את הסידור עד לאישור המנהל.</Typography.Paragraph>
        <Flex vertical gap="small">{data.requests.length ? [...data.requests].reverse().map((request) => <Card key={request.id} size="small" className="swap-card">
          <Flex justify="space-between" gap="small" wrap><Space direction="vertical"><Typography.Text strong>{request.requesterName} · {request.date} · {SHIFT_META[request.shift].shortLabel}</Typography.Text>{request.note && <Typography.Text>{request.note}</Typography.Text>}<Tag color={request.status === "approved" ? "green" : request.status === "open" ? "blue" : "default"}>{({ open: "ממתינה להחלפה", approved: "אושרה", rejected: "נדחתה", cancelled: "בוטלה" })[request.status]}</Tag></Space>
            {request.status === "open" && <Space wrap>{request.requesterId === data.staffId ? <Button disabled={busy} onClick={() => void action("/requests/close", { id: request.id })}>בטל בקשה</Button> : request.offers.includes(data.staffId) ? <Button disabled={busy} onClick={() => void action("/requests/withdraw", { id: request.id })}>בטל את ההצעה שלי</Button> : <Button type="primary" disabled={busy} onClick={() => void action("/requests/offer", { id: request.id })}>אני יכול/ה להחליף</Button>}</Space>}
          </Flex>
        </Card>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="אין בקשות החלפה" />}</Flex>
      </Card>
    </>}
    <Modal title="בקשת החלפה" open={Boolean(requesting)} onCancel={() => setRequesting(null)} okText="פתח בקשה" cancelText="ביטול" confirmLoading={busy} onOk={() => { void action("/requests", { start, key: requesting, note }).then((ok) => { if (ok) setRequesting(null); }); }}>
      <Typography.Paragraph>המדריכים יוכלו להציע להחליף אותך. השיבוץ ישתנה רק אחרי אישור המנהל.</Typography.Paragraph>
      <Input.TextArea aria-label="הערה לבקשת החלפה" maxLength={200} placeholder="הערה לצוות (לא חובה)" value={note} onChange={(event) => setNote(event.target.value)} />
    </Modal>
  </div>;
}
