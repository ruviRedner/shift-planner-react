import { useState } from "react";
import { Alert, Button, Checkbox, InputNumber, Modal, Select, Space, Table, Typography } from "antd";
import { ThunderboltOutlined } from "@ant-design/icons";
import { applyProposal, defaultAutoOptions, proposeSchedule } from "../domain/autoSchedule";
import type { AutoOptions, Proposal } from "../domain/autoSchedule";
import { assignmentKey, DAYS, SHIFT_META } from "../domain/planner";
import type { PlannerData, ShiftType } from "../domain/planner";
import { conflictsForPeriod, periodSlots } from "../domain/insights";

export function AutoScheduler({ data, onApply }: { data: PlannerData; onApply: (update: (data: PlannerData) => PlannerData, label: string) => void }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<AutoOptions>(defaultAutoOptions);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [snapshot, setSnapshot] = useState("");
  const updateOptions = (next: AutoOptions) => { setOptions(next); setProposal(null); };
  const preview = proposal ? applyProposal(data, proposal) : data;
  const stale = proposal !== null && snapshot !== JSON.stringify(data);
  const invalid = proposal && conflictsForPeriod(preview).some((conflict) => proposal.assignments[assignmentKey(conflict.week, conflict.day, conflict.shift)]?.includes(conflict.staffId) && !periodSlots(data).find((slot) => slot.week === conflict.week && slot.day === conflict.day && slot.shift === conflict.shift)?.ids.includes(conflict.staffId));
  return <>
    <Button type="primary" icon={<ThunderboltOutlined />} onClick={() => { setProposal(null); setOpen(true); }}>שיבוץ אוטומטי חכם</Button>
    <Modal title="הצעת שיבוץ אוטומטי" open={open} width={850} onCancel={() => setOpen(false)} okText="אשר את ההצעה" cancelText="ביטול" okButtonProps={{ disabled: !proposal || stale || Boolean(invalid) || Object.keys(proposal.assignments).length === 0 }} onOk={() => {
      if (!proposal || stale || invalid) return;
      onApply((current) => applyProposal(current, proposal), "שיבוץ אוטומטי"); setOpen(false);
    }}>
      <Typography.Paragraph>הגדירו את הדרישות לפני יצירת ההצעה. אנשים שכבר שובצו וקביעויות נשמרים; ההשלמה מתחשבת בחוסר זמינות ומעדיפה אנשים עם פחות משמרות בתקופה.</Typography.Paragraph>
      <Space wrap className="auto-options">
        {(Object.keys(SHIFT_META) as ShiftType[]).map((shift) => <label key={shift}>{SHIFT_META[shift].label}<br /><InputNumber aria-label={`אנשים נדרשים ${SHIFT_META[shift].label}`} min={1} max={20} value={options.required[shift]} onChange={(value) => updateOptions({ ...options, required: { ...options.required, [shift]: value ?? 1 } })} /></label>)}
        <label>מקסימום משמרות לאדם בשבוע<br /><InputNumber aria-label="מקסימום משמרות בשבוע" min={1} max={14} value={options.maxPerWeek} onChange={(value) => updateOptions({ ...options, maxPerWeek: value ?? 7 })} /></label>
      </Space>
      <Space wrap className="auto-options">
        <Checkbox checked={options.onePerDay} onChange={(event) => updateOptions({ ...options, onePerDay: event.target.checked })}>לא להוסיף שתי משמרות באותו יום</Checkbox>
        <Checkbox checked={options.respectCleared} onChange={(event) => updateOptions({ ...options, respectCleared: event.target.checked })}>לשמור משמרות שרוקנו ידנית</Checkbox>
        <Button onClick={() => { setSnapshot(JSON.stringify(data)); setProposal(proposeSchedule(data, options)); }}>צור הצעה</Button>
      </Space>
      {stale && <Alert type="warning" title="הסידור השתנה מאז יצירת ההצעה. צרו הצעה חדשה." />}
      {invalid && <Alert type="error" title="נבחר אדם שאינו זמין. שנו את הבחירה לפני האישור." />}
      {proposal && <>
        <Alert type={proposal.unfilled.length ? "warning" : "success"} title={`${Object.keys(proposal.assignments).length} משמרות בהצעה · ${proposal.unfilled.length} משמרות שלא ניתן היה להשלים לפי ההגדרות`} />
        <Typography.Paragraph type="secondary">אפשר לערוך את ההצעה לפני אישור. שינוי ידני כאן עשוי לחרוג ממגבלת העומס שהגדרתם.</Typography.Paragraph>
        <Table rowKey="key" size="small" pagination={false} scroll={{ y: 330, x: 560 }} dataSource={periodSlots(data).filter((slot) => Object.hasOwn(proposal.assignments, assignmentKey(slot.week, slot.day, slot.shift)) || proposal.unfilled.includes(assignmentKey(slot.week, slot.day, slot.shift))).map((slot) => ({ ...slot, key: assignmentKey(slot.week, slot.day, slot.shift) }))} columns={[
          { title: "משמרת", render: (_, slot) => `${slot.date} · ${DAYS[slot.day]} · ${SHIFT_META[slot.shift].shortLabel}` },
          { title: "אנשים", render: (_, slot) => <Select mode="multiple" aria-label={`הצעה ${slot.key}`} style={{ minWidth: 260 }} value={proposal.assignments[slot.key] ?? slot.ids} options={data.staff.map((member) => ({ label: member.name, value: member.id, disabled: slot.ids.includes(member.id) }))} onChange={(ids) => setProposal({ ...proposal, assignments: { ...proposal.assignments, [slot.key]: [...new Set([...slot.ids, ...ids])] } })} /> },
        ]} />
      </>}
    </Modal>
  </>;
}
