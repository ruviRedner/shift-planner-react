import { Card, Select, Table, Typography } from 'antd';
import { LAUNDRY_DAYS } from '../domain/laundry';
import type { StaffMember } from '../domain/planner';

export function LaundryBoard({ residents, laundry, onLaundry }: {
  residents: StaffMember[]; laundry: Record<string, string[]>;
  onLaundry: (date: string, ids: string[]) => void;
}) {
  const columns = LAUNDRY_DAYS.map((dayName, day) => {
    const dateKey = String(day);
    const selected = laundry[dateKey] ?? [];
    const names = selected.map((id) => residents.find((resident) => resident.id === id)?.name).filter(Boolean);
    return {
      key: dateKey,
      title: <Typography.Text strong>{dayName}</Typography.Text>,
      render: () => <div className="laundry-cell" data-laundry-day={dateKey}>
        <Select mode="multiple" className="no-print" style={{ width: '100%' }} aria-label={`כביסות ${dayName}`}
          value={selected} options={residents.map((resident) => ({ value: resident.id, label: resident.name }))}
          optionFilterProp="label" placeholder={residents.length ? 'בחרו דיירים' : 'הוסיפו דיירים למעלה'}
          disabled={!residents.length} onChange={(ids) => onLaundry(dateKey, ids)} allowClear />
        <span className="print-only">{names.join(', ') || '—'}</span>
      </div>,
    };
  });
  return <Card className="laundry-board" size="small" title="כביסות קבועות">
    <Table className="week-table" columns={columns} dataSource={[{ key: 'laundry' }]} pagination={false} bordered size="small" tableLayout="fixed" scroll={{ x: 900 }} />
  </Card>;
}
