import { useCallback, useEffect, useState } from "react";
import { Alert, App, Button, Card, Empty, Flex, Input, Select, Space, Table, Tag, Typography } from "antd";
import { api } from "./api";
import type { TeamData } from "./types";
import { SHIFT_META } from "../domain/planner";

export function TeamAdminPanel() {
  const [data, setData] = useState<TeamData | null>(null), [error, setError] = useState("");
  const [staffId, setStaffId] = useState<string>(), [invite, setInvite] = useState(""), [busy, setBusy] = useState(false);
  const { message, modal } = App.useApp();
  const load = useCallback(async () => { const next = await api<TeamData>("/team"); setData(next); setError(""); }, []);
  useEffect(() => { void load().catch((err) => setError(err.message)); const id = window.setInterval(() => void load().catch((err) => setError(err.message)), 4000); return () => window.clearInterval(id); }, [load]);
  async function action(path: string, input: unknown) {
    setBusy(true); try { await api(path, input); await load(); void message.success("הפעולה הושלמה"); } catch (err) { void message.error(err instanceof Error ? err.message : "הפעולה נכשלה"); } finally { setBusy(false); }
  }
  if (!data) return <Alert type={error ? "error" : "info"} title={error || "טוען נתוני צוות…"} />;
  const name = (id: string) => data.staff.find((member) => member.id === id)?.name ?? "איש צוות שהוסר";
  return <div className="personal-dashboard">
    {error && <Alert type="error" title={error} />}
    <Card title="בקשות החלפה לאישור">
      <Flex vertical gap="small">{data.requests.filter((request) => request.status === "open").map((request) => <Card size="small" key={request.id}>
        <Typography.Paragraph strong>{name(request.requesterId)} · {request.date} · {SHIFT_META[request.shift].label}</Typography.Paragraph>
        {request.note && <Typography.Paragraph>{request.note}</Typography.Paragraph>}
        <Space wrap>{request.offers.map((candidateId) => <Button key={candidateId} type="primary" disabled={busy} onClick={async () => {
          if (await modal.confirm({ title: "אישור החלפה", content: `להחליף את ${name(request.requesterId)} ב־${name(candidateId)} במשמרת זו בלבד?`, okText: "אשר החלפה", cancelText: "ביטול" })) void action("/requests/approve", { id: request.id, candidateId });
        }}>אשר את {name(candidateId)}</Button>)}{!request.offers.length && <Tag>טרם התקבלו הצעות</Tag>}<Button danger disabled={busy} onClick={() => void action("/requests/close", { id: request.id })}>דחה בקשה</Button></Space>
      </Card>)}{!data.requests.some((request) => request.status === "open") && <Empty description="אין בקשות פתוחות" />}</Flex>
    </Card>
    <Card title="חשבונות והזמנות למדריכים">
      <Typography.Paragraph>בחרו אדם מרשימת הצוות וצרו הזמנה אישית. הקישור תקף לשבעה ימים ולשימוש אחד. העבירו אותו למדריך בעצמכם.</Typography.Paragraph>
      <Space wrap><Select aria-label="איש צוות להזמנה" style={{ minWidth: 220 }} placeholder="בחרו איש צוות" value={staffId} onChange={setStaffId} options={data.staff.filter((member) => !data.users.some((user) => user.staffId === member.id && !user.disabled)).map((member) => ({ value: member.id, label: member.name }))} /><Button disabled={!staffId || busy} onClick={async () => {
        setBusy(true); try { const result = await api<{ token: string }>("/invitations", { staffId }); setInvite(`${window.location.origin}/#/join?token=${encodeURIComponent(result.token)}`); } catch (err) { void message.error((err as Error).message); } finally { setBusy(false); }
      }}>צור הזמנה</Button></Space>
      {invite && <Space.Compact block style={{ marginTop: 12 }}><Input aria-label="קישור הזמנה" readOnly value={invite} dir="ltr" /><Button onClick={() => { void navigator.clipboard.writeText(invite).then(() => message.success("הקישור הועתק"), () => message.info("אפשר לסמן את הקישור ולהעתיק ידנית")); }}>העתק קישור</Button></Space.Compact>}
      <Table rowKey="id" size="small" pagination={false} dataSource={data.users} columns={[
        { title: "שם משתמש", dataIndex: "username" }, { title: "תפקיד", render: (_, user) => user.role === "admin" ? "מנהל" : name(user.staffId!) },
        { title: "מצב", render: (_, user) => user.disabled ? "מושבת" : "פעיל" },
        { title: "", render: (_, user) => user.role === "staff" && !user.disabled && <Button danger disabled={busy} onClick={async () => { if (await modal.confirm({ title: "השבתת חשבון", content: "המשתמש ינותק ולא יוכל להתחבר. השיבוצים שלו יישמרו.", okText: "השבת", cancelText: "ביטול" })) void action("/users/disable", { id: user.id }); }}>השבת חשבון</Button> },
      ]} scroll={{ x: 520 }} />
    </Card>
    <Card title="היסטוריית החלפות ועדכונים" size="small"><Table size="small" rowKey="id" dataSource={data.audit} pagination={{ pageSize: 10 }} columns={[
      { title: "זמן", dataIndex: "at", render: (at: string) => new Date(at).toLocaleString("he-IL") },
      { title: "משתמש", dataIndex: "actor", render: (id: string) => data.users.find((user) => user.id === id)?.username ?? id },
      { title: "פעולה", dataIndex: "action", render: (action: string) => action === "swap-approved" ? "החלפה אושרה והשיבוץ עודכן" : "הסידור עודכן" },
    ]} /></Card>
  </div>;
}
