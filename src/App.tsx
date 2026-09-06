import { useEffect, useMemo, useState } from "react";
import {
  getJewishDayInfo,
  getJewishWeekInfo,
} from "./jewishCalendar";

import { Alert, App as AntApp, Badge, Button, Card, Checkbox, DatePicker, Empty, Flex, Form, Input, Layout, Modal, Space, Table, Tag, Typography } from "antd";
import type { TableColumnsType } from "antd";
import { CalendarOutlined, CopyOutlined, DeleteOutlined, LeftOutlined, PlusOutlined, PrinterOutlined, RightOutlined, TeamOutlined, UndoOutlined } from "@ant-design/icons";
import dayjs from "dayjs";

const STORAGE_KEY = "shift-planner-data-v1";

const DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי-שבת", "מוצ״ש"] as const;

type ShiftType = "afternoon" | "night" | "friday" | "motzeiShabbat";
type SaveState = "saved" | "saving" | "unavailable";

type StaffMember = {
  id: string;
  name: string;
};

type Period = {
  weekNotes: [string, string];
  assignments: Record<string, string[]>;
  beforeWeekCopy?: Record<string, string[]>;
};

type PlannerData = {
  version: 1;
  currentStart: string;
  staff: StaffMember[];
  periods: Record<string, Period>;
};

type EditingShift = {
  weekIndex: number;
  dayIndex: number;
  shiftType: ShiftType;
};

const SHIFT_META: Record<
  ShiftType,
  { label: string; shortLabel: string; tone: string }
> = {
  afternoon: { label: "משמרת צהריים", shortLabel: "צהריים", tone: "afternoon" },
  night: { label: "משמרת לילה", shortLabel: "לילה", tone: "night" },
  friday: { label: "משמרת שישי-שבת", shortLabel: "שישי-שבת", tone: "shabbat" },
  motzeiShabbat: { label: "משמרת לילה במוצ״ש", shortLabel: "לילה", tone: "night" },
};

function getShiftsForDay(dayIndex: number): ShiftType[] {
  if (dayIndex <= 4) return ["afternoon", "night"];
  if (dayIndex === 5) return ["friday"];
  return ["motzeiShabbat"];
}

function createEmptyPeriod(): Period {
  return { weekNotes: ["", ""], assignments: {} };
}

function parseDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function startOfSunday(date: Date): Date {
  return addDays(date, -date.getDay());
}

function getDefaultStart(): string {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const daysUntilSunday = today.getDay() === 0 ? 0 : 7 - today.getDay();
  return toDateKey(addDays(today, daysUntilSunday));
}

function makeInitialData(): PlannerData {
  return {
    version: 1,
    currentStart: getDefaultStart(),
    staff: [],
    periods: {},
  };
}

function loadData(): PlannerData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return makeInitialData();

    const parsed = JSON.parse(raw) as Partial<PlannerData>;
    if (
      parsed.version !== 1 ||
      typeof parsed.currentStart !== "string" ||
      !Array.isArray(parsed.staff) ||
      !parsed.periods
    ) {
      return makeInitialData();
    }

    // Merge legacy weekend slots once, so hidden assignments cannot reappear after editing.
    for (const period of Object.values(parsed.periods)) {
      for (const weekIndex of [0, 1]) {
        const mergedKey = `${weekIndex}:5:friday`;
        const legacyKeys = [
          `${weekIndex}:5:afternoon`,
          `${weekIndex}:5:night`,
          `${weekIndex}:6:shabbat`,
        ];
        const ids = [...new Set([
          ...(period.assignments[mergedKey] ?? []),
          ...legacyKeys.flatMap((key) => period.assignments[key] ?? []),
        ])];
        if (ids.length > 0) period.assignments[mergedKey] = ids;
        for (const key of legacyKeys) delete period.assignments[key];
      }
    }

    return parsed as PlannerData;
  } catch {
    return makeInitialData();
  }
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function assignmentKey(
  weekIndex: number,
  dayIndex: number,
  shiftType: ShiftType,
): string {
  return `${weekIndex}:${dayIndex}:${shiftType}`;
}

const shortDateFormatter = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "numeric",
});

const fullDateFormatter = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function formatRange(start: Date, end: Date): string {
  return `${fullDateFormatter.format(start)} – ${fullDateFormatter.format(end)}`;
}

function App() {
  const [data, setData] = useState<PlannerData>(loadData);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [newStaffName, setNewStaffName] = useState("");
  const [dialogStaffName, setDialogStaffName] = useState("");
  const [editing, setEditing] = useState<EditingShift | null>(null);
  const [draftIds, setDraftIds] = useState<string[]>([]);
  const { message, modal } = AntApp.useApp();
  function setToast(text: string) { void message.success(text); }
  const [staffSearch, setStaffSearch] = useState("");

  const periodStart = useMemo(() => parseDate(data.currentStart), [data.currentStart]);
  const periodEnd = useMemo(() => addDays(periodStart, 13), [periodStart]);
  const period = data.periods[data.currentStart] ?? createEmptyPeriod();

  const staffById = useMemo(
    () => new Map(data.staff.map((member) => [member.id, member])),
    [data.staff],
  );
  const shiftCounts = [0, 1].map((weekIndex) =>
    DAYS.reduce((count, _, dayIndex) => count + getShiftsForDay(dayIndex).filter(
      (shift) => (period.assignments[assignmentKey(weekIndex, dayIndex, shift)] ?? []).some((id) => staffById.has(id)),
    ).length, 0),
  );
  const totalShifts = DAYS.reduce((count, _, index) => count + getShiftsForDay(index).length, 0) * 2;
  const visibleStaff = data.staff.filter((member) => member.name.includes(staffSearch.trim()));

  useEffect(() => {
    setSaveState("saving");
    const timeoutId = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        setSaveState("saved");
      } catch {
        setSaveState("unavailable");
      }
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [data]);


  function updateCurrentPeriod(updater: (current: Period) => Period) {
    setData((current) => {
      const currentPeriod = current.periods[current.currentStart] ?? createEmptyPeriod();
      return {
        ...current,
        periods: {
          ...current.periods,
          [current.currentStart]: updater(currentPeriod),
        },
      };
    });
  }

  function addStaff(rawName: string): { id: string; isNew: boolean } | null {
    const name = rawName.trim().replace(/\s+/g, " ");
    if (!name) return null;

    const existing = data.staff.find(
      (member) => member.name.localeCompare(name, "he", { sensitivity: "base" }) === 0,
    );
    if (existing) return { id: existing.id, isNew: false };

    const member = { id: createId(), name };
    setData((current) => ({ ...current, staff: [...current.staff, member] }));
    return { id: member.id, isNew: true };
  }

  function handleAddStaff() {
    const result = addStaff(newStaffName);
    if (!result) return;

    setNewStaffName("");
    setToast(result.isNew ? "איש הצוות נוסף" : "השם כבר קיים ברשימה");
  }

  function handleDialogAddStaff() {
    const result = addStaff(dialogStaffName);
    if (!result) return;

    setDraftIds((current) =>
      current.includes(result.id) ? current : [...current, result.id],
    );
    setDialogStaffName("");
    setToast(result.isNew ? "השם נוסף ונבחר" : "השם הקיים נבחר");
  }

  async function removeStaff(member: StaffMember) {
    const isAssigned = Object.values(data.periods).some((savedPeriod) =>
      Object.values(savedPeriod.assignments).some((ids) => ids.includes(member.id)),
    );
    const message = isAssigned
      ? `להסיר את ${member.name}? השם יימחק גם מכל המשמרות שבהן שובץ.`
      : `להסיר את ${member.name} מרשימת הצוות?`;

    if (!await modal.confirm({ title: "הסרת איש צוות", content: message, okText: "הסר", cancelText: "ביטול", okButtonProps: { danger: true } })) return;

    setData((current) => {
      const periods = Object.fromEntries(
        Object.entries(current.periods).map(([dateKey, savedPeriod]) => {
          const assignments = Object.fromEntries(
            Object.entries(savedPeriod.assignments)
              .map(([key, ids]) => [key, ids.filter((id) => id !== member.id)] as const)
              .filter(([, ids]) => ids.length > 0),
          );
          return [dateKey, { ...savedPeriod, assignments }];
        }),
      );

      return {
        ...current,
        staff: current.staff.filter((item) => item.id !== member.id),
        periods,
      };
    });
    setToast("איש הצוות הוסר");
  }

  function openAssignment(weekIndex: number, dayIndex: number, shiftType: ShiftType) {
    setStaffSearch("");
    setDraftIds(getAssignmentIds(weekIndex, dayIndex, shiftType));
    setDialogStaffName("");
    setEditing({ weekIndex, dayIndex, shiftType });
  }

  function toggleDraftId(id: string) {
    setDraftIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function saveAssignment() {
    if (!editing) return;
    const key = assignmentKey(editing.weekIndex, editing.dayIndex, editing.shiftType);

    updateCurrentPeriod((current) => {
      const assignments = { ...current.assignments };
      if (draftIds.length > 0) assignments[key] = draftIds;
      else delete assignments[key];
      return {
        ...current,
        assignments,
        beforeWeekCopy: editing.weekIndex === 1 ? undefined : current.beforeWeekCopy,
      };
    });

    setEditing(null);
    setToast("השיבוץ נשמר");
  }

  function movePeriod(dayOffset: number) {
    setData((current) => ({
      ...current,
      currentStart: toDateKey(addDays(parseDate(current.currentStart), dayOffset)),
    }));
  }

  function handleDateChange(value: string) {
    if (!value) return;
    const normalized = toDateKey(startOfSunday(parseDate(value)));
    setData((current) => ({ ...current, currentStart: normalized }));
    if (normalized !== value) setToast("התאריך הותאם ליום ראשון של אותו שבוע");
  }

  function updateWeekNote(weekIndex: number, value: string) {
    updateCurrentPeriod((current) => {
      const weekNotes: [string, string] = [...current.weekNotes];
      weekNotes[weekIndex] = value;
      return { ...current, weekNotes };
    });
  }

  function getAssignmentIds(
    weekIndex: number,
    dayIndex: number,
    shiftType: ShiftType,
  ): string[] {
    const currentKey = assignmentKey(weekIndex, dayIndex, shiftType);
    return period.assignments[currentKey] ?? [];
  }

  async function copyFirstWeek() {
    const targetHasAssignments = Object.keys(period.assignments).some((key) =>
      key.startsWith("1:"),
    );
    if (
      targetHasAssignments &&
      !await modal.confirm({ title: "העתקת שיבוצים", content: "בשבוע השני כבר יש שיבוצים. להחליף אותם בשיבוצי השבוע הראשון?", okText: "העתק", cancelText: "ביטול" })
    ) {
      return;
    }

    updateCurrentPeriod((current) => {
      const beforeWeekCopy = Object.fromEntries(
        Object.entries(current.assignments).filter(([key]) => key.startsWith("1:")),
      );
      const assignments = Object.fromEntries(
        Object.entries(current.assignments).filter(([key]) => !key.startsWith("1:")),
      );

      Object.entries(current.assignments).forEach(([key, ids]) => {
        if (key.startsWith("0:")) assignments[key.replace(/^0:/, "1:")] = [...ids];
      });

      return { ...current, assignments, beforeWeekCopy };
    });
    setToast("השבוע הראשון הועתק לשבוע השני");
  }

  function undoWeekCopy() {
    updateCurrentPeriod((current) => {
      if (!current.beforeWeekCopy) return current;
      const assignments = Object.fromEntries(
        Object.entries(current.assignments).filter(([key]) => !key.startsWith("1:")),
      );
      for (const [key, ids] of Object.entries(current.beforeWeekCopy)) {
        const existingIds = ids.filter((id) => staffById.has(id));
        if (existingIds.length > 0) assignments[key] = existingIds;
      }
      return { ...current, assignments, beforeWeekCopy: undefined };
    });
    setToast("ההעתקה בוטלה ושיבוצי השבוע השני שוחזרו");
  }

  async function clearCurrentPeriod() {
    if (!await modal.confirm({ title: "ניקוי התקופה", content: "לנקות את כל השיבוצים וההערות בתקופה הנוכחית?", okText: "נקה תקופה", cancelText: "ביטול", okButtonProps: { danger: true } })) return;
    setData((current) => ({
      ...current,
      periods: { ...current.periods, [current.currentStart]: createEmptyPeriod() },
    }));
    setToast("התקופה נוקתה");
  }

  const editingDate = editing
    ? addDays(periodStart, editing.weekIndex * 7 + editing.dayIndex)
    : null;

  return (
    <Layout className="planner-layout">
      <Layout.Content className="planner-content">
        <Flex justify="space-between" align="center" gap="middle" wrap className="planner-heading">
          <Space orientation="vertical" size={0}>
            <Typography.Title level={3} style={{ margin: 0 }}>סידור משמרות</Typography.Title>
            <Typography.Text type="secondary">{formatRange(periodStart, periodEnd)}</Typography.Text>
          </Space>
          <Space wrap className="no-print">
            <Badge status={saveState === "saved" ? "success" : saveState === "saving" ? "processing" : "error"} text={saveState === "saved" ? "נשמר אוטומטית" : saveState === "saving" ? "שומר…" : "השמירה אינה זמינה"} />
            <Button icon={<PrinterOutlined />} onClick={() => window.print()}>הדפסה</Button>
            <Button danger icon={<DeleteOutlined />} onClick={clearCurrentPeriod}>נקה תקופה</Button>
          </Space>
        </Flex>

        <Card className="no-print" size="small">
          <Flex justify="space-between" align="center" gap="middle" wrap>
            <Space wrap>
              <Button icon={<RightOutlined />} onClick={() => movePeriod(-14)}>התקופה הקודמת</Button>
              <DatePicker aria-label="תאריך תחילת הסידור" value={dayjs(data.currentStart)} allowClear={false} format="DD/MM/YYYY" onChange={(date) => { if (date) handleDateChange(date.format("YYYY-MM-DD")); }} />
              <Button icon={<LeftOutlined />} onClick={() => movePeriod(14)}>התקופה הבאה</Button>
            </Space>
            <Space wrap>
              <Button icon={<CopyOutlined />} onClick={copyFirstWeek}>העתק שבוע ראשון לשבוע שני</Button>
              {period.beforeWeekCopy && <Button icon={<UndoOutlined />} onClick={undoWeekCopy}>בטל העתקה לשבוע השני</Button>}
            </Space>
          </Flex>
        </Card>

        <Card size="small" title={<Space><TeamOutlined />אנשי צוות <Tag>{data.staff.length}</Tag></Space>} className="no-print">
          <Form onFinish={handleAddStaff} className="staff-form">
            <Space.Compact block>
              <Input value={newStaffName} maxLength={50} autoComplete="off" onChange={(event) => setNewStaffName(event.target.value)} placeholder="שם איש הצוות" aria-label="שם איש הצוות" />
              <Button type="primary" htmlType="submit" icon={<PlusOutlined />} disabled={!newStaffName.trim()}>הוסף</Button>
            </Space.Compact>
          </Form>
          <Flex gap="small" wrap className="staff-list">
            {data.staff.length === 0 ? <Typography.Text type="secondary">הוסיפו אנשי צוות כדי להתחיל לשבץ.</Typography.Text> : data.staff.map((member) => (
              <Tag key={member.id} closable onClose={(event) => { event.preventDefault(); void removeStaff(member); }}>{member.name}</Tag>
            ))}
          </Flex>
        </Card>

        <Alert className="guide-notice" type="info" showIcon title="מדריכים יקרים, כל מי שרוצה להחליף משמרת שיעדכן אותי ויסמן בדף." />

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
              onCell: (_, rowIndex) => ({ rowSpan: dayIndex >= 5 ? rowIndex === 0 ? 2 : 0 : 1 }),
              render: (_, row) => {
                const shiftType = getShiftsForDay(dayIndex)[row.key];
                if (!shiftType) return null;
                const meta = SHIFT_META[shiftType];
                const members = getAssignmentIds(weekIndex, dayIndex, shiftType).map((id) => staffById.get(id)).filter((member): member is StaffMember => Boolean(member));
                return <Button block type={members.length ? "default" : "dashed"} className="shift-button" onClick={() => openAssignment(weekIndex, dayIndex, shiftType)} aria-label={`${meta.label}, ${dayName}, ${shortDateFormatter.format(date)}`}>
                  <Flex vertical gap="small" align="stretch" className="shift-content">
                    <Flex justify="space-between" align="center" gap={4}>
                      <Tag color={shiftType === "afternoon" ? "blue" : shiftType === "friday" ? "purple" : "geekblue"} style={{ margin: 0 }}>{meta.shortLabel}</Tag>
                      {members.length > 0 && <Typography.Text type="secondary">{members.length}</Typography.Text>}
                    </Flex>
                    {members.length ? members.map((member) => <Typography.Text key={member.id}>{member.name}</Typography.Text>) : <Typography.Text type="secondary"><PlusOutlined /> הוספת שיבוץ</Typography.Text>}
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
            <Table className="week-table" columns={columns} dataSource={[{ key: 0 }, { key: 1 }]} pagination={false} bordered size="small" tableLayout="fixed" scroll={{ x: 1000 }} />
          </Card>;
        })}
      </Layout.Content>

      <Modal open={Boolean(editing)} onCancel={() => setEditing(null)} onOk={saveAssignment} title={editing ? SHIFT_META[editing.shiftType].label : "שיבוץ משמרת"} okText="שמור שיבוץ" cancelText="ביטול" destroyOnHidden>
        <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
          <Typography.Text type="secondary">{editing && editingDate ? `${DAYS[editing.dayIndex]} · ${fullDateFormatter.format(editingDate)}` : ""}</Typography.Text>
          {data.staff.length > 0 && <Input.Search allowClear value={staffSearch} onChange={(event) => setStaffSearch(event.target.value)} placeholder="חיפוש איש צוות" aria-label="חיפוש איש צוות" />}
          <Typography.Text type="secondary">{draftIds.length} נבחרו</Typography.Text>
          <Flex vertical gap="small" className="assignment-options">
            {visibleStaff.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={data.staff.length ? "לא נמצאו שמות" : "הוסיפו איש צוות כדי לשבץ"} /> : visibleStaff.map((member) => <Checkbox key={member.id} checked={draftIds.includes(member.id)} onChange={() => toggleDraftId(member.id)}>{member.name}</Checkbox>)}
          </Flex>
          <Form onFinish={handleDialogAddStaff}>
            <Space.Compact block>
              <Input value={dialogStaffName} maxLength={50} autoComplete="off" onChange={(event) => setDialogStaffName(event.target.value)} placeholder="שם חדש שלא נמצא ברשימה" aria-label="הוספת איש צוות חדש" />
              <Button htmlType="submit" icon={<PlusOutlined />} disabled={!dialogStaffName.trim()}>הוסף ובחר</Button>
            </Space.Compact>
          </Form>
        </Space>
      </Modal>
    </Layout>
  );
}

export default App;
