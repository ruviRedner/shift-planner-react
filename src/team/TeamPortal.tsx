import { useEffect, useState } from "react";
import { Alert, App as AntApp, Button, Card, Form, Input, Modal, Space, Tabs, Typography } from "antd";
import Planner from "../App";
import { api } from "./api";
import type { User } from "./types";
import { connectTeamRepository } from "./remoteRepository";
import { browserRepository } from "../storage/repository";
import type { PlannerRepository } from "../storage/repository";
import { PersonalDashboard } from "./PersonalDashboard";
import { TeamAdminPanel } from "./TeamAdminPanel";

function SharedPlanner() {
  const [repository, setRepository] = useState<PlannerRepository | null>(null), [error, setError] = useState("");
  const { modal, message } = AntApp.useApp();
  useEffect(() => { let active = true; void connectTeamRepository().then((repo) => { if (active) setRepository(repo); }).catch((err) => setError(err.message)); return () => { active = false; }; }, []);
  return <>
    <Alert className="no-print" type="info" showIcon title="סידור משותף לצוות — השינויים נשמרים בשרת" description="עדכונים ממדריכים וממנהלים אחרים נטענים אוטומטית. קבלת עדכון חיצוני מאפסת את היסטוריית הביטול המקומית כדי לשמור על עבודת האחרים." action={repository && <Button onClick={async () => {
      try {
        const local = browserRepository.load();
        if (await modal.confirm({ title: "העברת הסידור המקומי לשרת", content: `להחליף את הסידור המשותף בנתוני הדפדפן הכוללים ${local.staff.length} אנשים ו־${Object.keys(local.periods).length} תקופות? הורידו גיבוי של הסידור המשותף לפני החלפה.`, okText: "העבר לשרת", cancelText: "ביטול" })) { await repository.save(local); await repository.reload?.(); }
      } catch (err) { void message.error((err as Error).message); }
    }}>העבר סידור מהדפדפן לשרת</Button>} />
    {error && <Alert type="error" title={error} />}
    {repository && <Planner repository={repository} />}
  </>;
}

export function TeamPortal() {
  const [status, setStatus] = useState<{ needsSetup: boolean; user: User | null } | null>(null), [error, setError] = useState("");
  const [busy, setBusy] = useState(false), [passwordOpen, setPasswordOpen] = useState(false);
  const joinToken = new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("token");
  const { message } = AntApp.useApp();
  useEffect(() => { void api<{ needsSetup: boolean; user: User | null }>("/status").then(setStatus).catch((err) => setError(err.message)); }, []);
  async function login(values: Record<string, string>) {
    setBusy(true); setError("");
    try {
      const user = await api<User>(status?.needsSetup ? "/setup" : joinToken ? "/join" : "/login", { ...values, token: joinToken });
      setStatus({ needsSetup: false, user }); if (joinToken) window.history.replaceState(null, "", "/#/team");
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return <div className="team-portal">
    <Space wrap className="team-toolbar no-print"><Button onClick={() => { window.location.hash = ""; }}>חזור לסידור המקומי</Button>{status?.user && <><Typography.Text strong>{status.user.username} · {status.user.role === "admin" ? "מנהל" : "מדריך"}</Typography.Text><Button onClick={() => setPasswordOpen(true)}>שינוי סיסמה</Button><Button onClick={() => { void api("/logout", {}).then(() => { setStatus({ needsSetup: false, user: null }); }); }}>התנתק</Button></>}</Space>
    {error && <Alert type="error" title={error} />}
    {!status?.user ? <Card className="auth-card" title={status?.needsSetup ? "הקמת חשבון מנהל" : joinToken ? "יצירת חשבון מדריך" : "כניסה לאזור הצוות"}>
      <Typography.Paragraph>{status?.needsSetup ? "בהפעלה הראשונה הגדירו חשבון מנהל בעזרת קוד ההתקנה שמופיע בטרמינל של השרת." : "הסידור, הזמינות וההחלפות שלך מסונכרנים בין המכשירים."}</Typography.Paragraph>
      <Form layout="vertical" onFinish={login}>
        {status?.needsSetup && <Form.Item name="setupToken" label="קוד התקנה" rules={[{ required: true }]}><Input aria-label="קוד התקנה" autoComplete="off" /></Form.Item>}
        <Form.Item name="username" label="שם משתמש" rules={[{ required: true }, { pattern: /^[a-zA-Z0-9_.-]{3,40}$/, message: "3–40 אותיות באנגלית, ספרות או ._-" }]}><Input aria-label="שם משתמש" autoComplete="username" dir="ltr" /></Form.Item>
        <Form.Item name="password" label="סיסמה" rules={[{ required: true }, ...((status?.needsSetup || joinToken) ? [{ min: 10, message: "לפחות 10 תווים" }] : [])]}><Input.Password aria-label="סיסמה" autoComplete={status?.needsSetup || joinToken ? "new-password" : "current-password"} dir="ltr" /></Form.Item>
        <Button block type="primary" htmlType="submit" loading={busy} disabled={!status}>{status?.needsSetup || joinToken ? "צור חשבון" : "התחבר"}</Button>
      </Form>
    </Card> : status.user.role === "admin" ? <Tabs destroyOnHidden items={[
      { key: "planner", label: "הסידור המשותף", children: <SharedPlanner /> },
      { key: "team", label: "החלפות וחשבונות", children: <TeamAdminPanel /> },
    ]} /> : <PersonalDashboard />}
    <Modal title="שינוי סיסמה" open={passwordOpen} onCancel={() => setPasswordOpen(false)} footer={null} destroyOnHidden>
      <Form layout="vertical" onFinish={async (values) => { try { await api("/password", values); setPasswordOpen(false); void message.success("הסיסמה עודכנה"); } catch (err) { void message.error((err as Error).message); } }}>
        <Form.Item name="currentPassword" label="סיסמה נוכחית" rules={[{ required: true }]}><Input.Password autoComplete="current-password" /></Form.Item><Form.Item name="password" label="סיסמה חדשה" rules={[{ required: true }, { min: 10, max: 200 }]}><Input.Password autoComplete="new-password" /></Form.Item><Button htmlType="submit" type="primary">שמור סיסמה</Button>
      </Form>
    </Modal>
  </div>;
}
