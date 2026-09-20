import { Card, Select, Space, Table, Typography } from 'antd';
import { addDays, shortDateFormatter, toDateKey } from '../domain/planner';
import type { StaffMember } from '../domain/planner';

export function LaundryBoard({ periodStart, residents, laundry, onLaundry }: {
  periodStart: Date; residents: StaffMember[]; laundry: Record<string, string[]>;
  onLaundry: (date: string, ids: string[]) => void;
}) {
  const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  const columns = Array.from({ length: 14 }, (_, day) => {
    const date = addDays(periodStart, day), dateKey = toDateKey(date);
    const selected = laundry[dateKey] ?? [];
    const names = selected.map((id) => residents.find((resident) => resident.id === id)?.name).filter(Boolean);
    return {
      key: dateKey,
      title: <Space orientation="vertical" size={0}><Typography.Text strong>{days[day % 7]}</Typography.Text><Typography.Text type="secondary">{shortDateFormatter.format(date)}</Typography.Text></Space>,
      render: () => <div className="laundry-cell" data-laundry-date={dateKey}>
        <Select mode="multiple" className="no-print" style={{ width: '100%' }} aria-label={`כביסות ${days[day % 7]} ${shortDateFormatter.format(date)}`}
          value={selected} options={residents.map((resident) => ({ value: resident.id, label: resident.name }))}
          optionFilterProp="label" placeholder={residents.length ? 'בחרו דיירים' : 'הוסיפו דיירים למעלה'}
          disabled={!residents.length} onChange={(ids) => onLaundry(dateKey, ids)} allowClear />
        <span className="print-only">{names.join(', ') || '—'}</span>
      </div>,
    };
  });
  return <Card className="laundry-board" size="small" title="כביסות לשבועיים">
    <Table className="week-table" columns={columns} dataSource={[{ key: 'laundry' }]} pagination={false} bordered size="small" tableLayout="fixed" scroll={{ x: 1960 }} />
  </Card>;
}
