import { Button, Card, Flex, Input, Select, Space, Table, Tag, Typography } from "antd";
import type { TableColumnsType } from "antd";
import { CalendarOutlined, PlusOutlined } from "@ant-design/icons";
import { getJewishDayInfo, getJewishWeekInfo } from "../jewishCalendar";
import { resolveAssignment } from "../assignments";
import { unavailableForShift } from "../domain/insights";
import { DAYS, SHIFT_META, getShiftsForDay, addDays, toDateKey, assignmentKey, shortDateFormatter, formatRange } from "../domain/planner";
import type { Period, StaffMember, ShiftType, Unavailability } from "../domain/planner";

type Props = { period: Period; periodStart: Date; staff: StaffMember[]; recurring: Record<string, string[]>; unavailability: Unavailability[];
  residents: StaffMember[]; laundry: Record<string, string[]>; onLaundry: (date: string, ids: string[]) => void;
  onEdit: (week: number, day: number, shift: ShiftType) => void; onNote: (week: number, value: string) => void };

export function WeekBoard({ period, periodStart, staff, recurring, unavailability, residents, laundry, onLaundry, onEdit: openAssignment, onNote: updateWeekNote }: Props) {
  const staffById = new Map(staff.map((member) => [member.id, member]));
  const rowCount = Math.max(...DAYS.map((_, day) => getShiftsForDay(day).length));
  const getAssignmentIds = (week: number, day: number, shift: ShiftType) => resolveAssignment(period.assignments, recurring, week, day, shift);
  const totalShifts = DAYS.reduce((count, _, day) => count + getShiftsForDay(day).length, 0) * 2;
  const shiftCounts = [0, 1].map((week) => DAYS.reduce((count, _, day) => count + getShiftsForDay(day).filter((shift) => getAssignmentIds(week, day, shift).some((id) => staffById.has(id))).length, 0));
  return <>
        {[0, 1].map((weekIndex) => {
          const weekStart = addDays(periodStart, weekIndex * 7);
          const weekEnd = addDays(weekStart, 6);
          const weekInfo = getJewishWeekInfo(weekEnd);
          const columns: TableColumnsType<{ key: number }> = DAYS.map((dayName, dayIndex) => {
            const date = addDays(weekStart, dayIndex);
            const jewishDay = getJewishDayInfo(date);
            return {
              key: dayName,
              title: <Space orientation="vertical" size={2}>
                <Typography.Text strong>{dayName}</Typography.Text>
                <Typography.Text type="secondary">{shortDateFormatter.format(date)} · {jewishDay.hebrewDate}</Typography.Text>
                {jewishDay.holidays.length > 0 && <Tag color="gold" style={{ whiteSpace: "normal", margin: 0 }}>{jewishDay.holidays.join(" · ")}</Tag>}
              </Space>,
              onCell: (row, rowIndex) => ({ rowSpan: row.key === rowCount ? 1 : getShiftsForDay(dayIndex).length === 1 ? rowIndex === 0 ? rowCount : 0 : 1 }),
              render: (_, row) => {
                if (row.key === rowCount) {
                  const dateKey = toDateKey(date), selected = laundry[dateKey] ?? [];
                  const names = selected.map((id) => residents.find((resident) => resident.id === id)?.name).filter(Boolean);
                  const laundryDay = dayIndex === 5 ? 'שישי' : dayIndex === 6 ? 'שבת' : dayName;
                  return <div className="laundry-cell" data-laundry-date={dateKey}>
                    <Typography.Text strong>כביסות{dayIndex >= 5 ? ` · ${laundryDay}` : ''}</Typography.Text>
                    <Select mode="multiple" className="no-print" style={{ width: '100%' }} aria-label={`כביסות ${laundryDay} ${shortDateFormatter.format(date)}`}
                      value={selected} options={residents.map((resident) => ({ value: resident.id, label: resident.name }))}
                      optionFilterProp="label" placeholder={residents.length ? 'בחרו דיירים' : 'הוסיפו דיירים למעלה'}
                      disabled={!residents.length} onChange={(ids) => onLaundry(dateKey, ids)} allowClear />
                    <span className="print-only">{names.join(', ') || '—'}</span>
                  </div>;
                }
                const shiftType = getShiftsForDay(dayIndex)[row.key];
                if (!shiftType) return null;
                const meta = SHIFT_META[shiftType];
                const members = getAssignmentIds(weekIndex, dayIndex, shiftType).map((id) => staffById.get(id)).filter((member): member is StaffMember => Boolean(member));
                return <Button block type={members.length ? "default" : "dashed"} className="shift-button" onClick={() => openAssignment(weekIndex, dayIndex, shiftType)} aria-label={`${meta.label}, ${dayName}, ${shortDateFormatter.format(date)}`}>
                  <Flex vertical gap="small" align="stretch" className="shift-content">
                    <Flex justify="space-between" align="center" gap={4}>
                      <Tag color={meta.color} style={{ margin: 0 }}>{meta.shortLabel}</Tag>
                      {members.length > 0 && <Typography.Text type="secondary">{members.length}</Typography.Text>}
                    </Flex>
                    {members.length ? members.map((member) => <Typography.Text key={member.id} type={unavailableForShift(unavailability, member.id, toDateKey(date), shiftType) ? "danger" : undefined}>{member.name}{unavailableForShift(unavailability, member.id, toDateKey(date), shiftType) && <span className="availability-warning"> · לא זמין/ה</span>}</Typography.Text>) : <Typography.Text type="secondary"><PlusOutlined /> הוספת שיבוץ</Typography.Text>}
                    {(recurring[`${dayIndex}:${shiftType}`] ?? []).length > 0 && <span className="assignment-source no-print">{Object.hasOwn(period.assignments, assignmentKey(weekIndex, dayIndex, shiftType)) ? "שינוי חד־פעמי" : "שיבוץ קבוע"}</span>}
                  </Flex>
                </Button>;
              },
            };
          });
          return <Card key={weekIndex} className="week-card" size="small" title={<Space wrap><CalendarOutlined /><span>שבוע {weekIndex === 0 ? "ראשון" : "שני"}</span><Typography.Text type="secondary">{formatRange(weekStart, weekEnd)}</Typography.Text></Space>}>
            <Flex justify="space-between" align="center" gap="small" wrap className="week-toolbar">
              <Space wrap><Tag color="blue">{weekInfo.parasha || weekInfo.shabbatHoliday || "שבת חג"}</Tag><Typography.Text type="secondary" className="no-print">{shiftCounts[weekIndex]} מתוך {totalShifts / 2} משמרות משובצות</Typography.Text></Space>
              <Input className="week-note no-print" aria-label={`הערה לשבוע ${weekIndex + 1}`} placeholder="הערה לשבוע" maxLength={80} value={period.weekNotes[weekIndex]} onChange={(event) => updateWeekNote(weekIndex, event.target.value)} />
              {period.weekNotes[weekIndex] && <Typography.Text className="print-only">{period.weekNotes[weekIndex]}</Typography.Text>}
            </Flex>
            <Table className="week-table" columns={columns} dataSource={Array.from({ length: rowCount + 1 }, (_, key) => ({ key }))} pagination={false} bordered size="small" tableLayout="fixed" scroll={{ x: 1000 }} />
          </Card>;
        })}
  </>;
}
