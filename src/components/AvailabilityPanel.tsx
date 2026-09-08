import { useState } from "react";
import { Button, Card, DatePicker, Input, Select, Space, Table, Typography } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import { createId } from "../domain/planner";
import type { StaffMember, Unavailability } from "../domain/planner";
import type { Dayjs } from "dayjs";

type Props = { staff: StaffMember[]; entries: Unavailability[]; onAdd: (entry: Unavailability) => void; onRemove: (id: string) => void };

export function AvailabilityPanel({ staff, entries, onAdd, onRemove }: Props) {
  const [staffId, setStaffId] = useState<string>();
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [note, setNote] = useState("");
  const names = new Map(staff.map((member) => [member.id, member.name]));
  function add() {
    if (!staffId || !names.has(staffId) || !range?.[0] || !range[1]) return;
    onAdd({ id: createId(), staffId, start: range[0].format("YYYY-MM-DD"), end: range[1].format("YYYY-MM-DD"), note: note.trim() });
    setRange(null); setNote("");
  }
  return <Card size="small" className="no-print">
    <details className="recurring-settings">
      <summary>חוסר זמינות וחופשות</summary>
      <Typography.Paragraph type="secondary">בחרו אדם וטווח תאריכים, כולל יום ההתחלה והסיום. חוסר זמינות חל על כל המשמרות בתאריך; שישי־שבת נבדקת בשני הימים. ההתראה אינה מסירה שיבוץ.</Typography.Paragraph>
      <div>
        <Space wrap className="availability-form">
          <Select aria-label="איש צוות לחוסר זמינות" placeholder="בחר איש צוות" style={{ minWidth: 180 }} value={staffId && names.has(staffId) ? staffId : undefined} onChange={setStaffId} showSearch optionFilterProp="label" options={staff.map((member) => ({ value: member.id, label: member.name }))} />
          <DatePicker.RangePicker value={range} onChange={setRange} format="DD/MM/YYYY" aria-label="טווח חוסר זמינות" />
          <Input aria-label="הערת חוסר זמינות" placeholder="הערה (לא חובה)" value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} />
          <Button type="primary" onClick={add} disabled={!staffId || !names.has(staffId) || !range?.[0] || !range[1]}>הוסף חוסר זמינות</Button>
        </Space>
      </div>
      <Table rowKey="id" size="small" pagination={{ pageSize: 5, hideOnSinglePage: true }} scroll={{ x: 560 }} dataSource={entries} columns={[
        { title: "שם", dataIndex: "staffId", render: (id: string) => names.get(id) },
        { title: "מתאריך", dataIndex: "start" }, { title: "עד תאריך", dataIndex: "end" },
        { title: "הערה", dataIndex: "note" },
        { title: "", key: "remove", render: (_, entry) => <Button danger icon={<DeleteOutlined />} aria-label={`הסר חוסר זמינות של ${names.get(entry.staffId)} מ־${entry.start}`} onClick={() => onRemove(entry.id)} /> },
      ]} />
    </details>
  </Card>;
}
