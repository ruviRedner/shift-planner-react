import { Alert, Badge, Button, Card, DatePicker, Flex, Form, Input, Layout, Space, Tag, Typography } from "antd";
import { CopyOutlined, DeleteOutlined, LeftOutlined, PlusOutlined, PrinterOutlined, RightOutlined, TeamOutlined, UndoOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { BackupControls } from "./components/BackupControls";
import { WorkloadSummary } from "./components/WorkloadSummary";
import { AvailabilityPanel } from "./components/AvailabilityPanel";
import { WeekBoard } from "./components/WeekBoard";
import { AssignmentDialog } from "./components/AssignmentDialog";
import { DAYS, SHIFT_META, getShiftsForDay, parseDate, shortDateFormatter, formatRange } from "./domain/planner";
import { usePlannerController } from "./hooks/usePlannerController";
import type { PlannerRepository } from "./storage/repository";
import { AutoScheduler } from "./components/AutoScheduler";
import { PublishPanel } from "./components/PublishPanel";

function App({ repository }: { repository: PlannerRepository }) {
  const {
    data, setData, restore, saveState, saveError, undo, canUndo, undoLabel, loadError,
    newStaffName, setNewStaffName, dialogStaffName, setDialogStaffName,
    editing, setEditing, draftIds, staffSearch, setStaffSearch,
    periodStart, periodEnd, period, staffById, visibleStaff, conflicts, editingDate,
    setToast, handleAddStaff, handleDialogAddStaff, removeStaff, openAssignment,
    toggleDraftId, saveAssignment, restoreRecurring, movePeriod, handleDateChange,
    updateWeekNote, copyFirstWeek, undoWeekCopy, clearCurrentPeriod,
  } = usePlannerController(repository);
  return (
    <Layout className="planner-layout">
      <Layout.Content className="planner-content">
        <Flex justify="space-between" align="center" gap="middle" wrap className="planner-heading">
          <Space orientation="vertical" size={0}>
            <Typography.Title level={3} style={{ margin: 0 }}>סידור משמרות</Typography.Title>
            <Typography.Text type="secondary">{formatRange(periodStart, periodEnd)}</Typography.Text>
          </Space>
          <Space wrap className="no-print">
            <AutoScheduler data={data} onApply={setData} />
            <PublishPanel data={data} onPublish={setData} />
            <BackupControls data={data} onRestore={restore} />
            <Button icon={<UndoOutlined />} disabled={!canUndo} title={undoLabel} onClick={() => { undo(); setEditing(null); setToast("הפעולה האחרונה בוטלה"); }}>בטל פעולה אחרונה</Button>
            <Badge status={saveState === "saved" ? "success" : saveState === "saving" ? "processing" : "error"} text={saveState === "saved" ? "נשמר אוטומטית" : saveState === "saving" ? "שומר…" : "השמירה אינה זמינה"} />
            <Button icon={<PrinterOutlined />} onClick={() => window.print()}>הדפסה</Button>
            <Button danger icon={<DeleteOutlined />} onClick={clearCurrentPeriod}>נקה תקופה</Button>
          </Space>
        </Flex>

        {loadError && <Alert type="error" showIcon title={loadError} className="no-print" />}
        {saveState === "unavailable" && !loadError && <Alert type="error" showIcon title="השינויים לא נשמרו. הורידו גיבוי לפני סגירת הדף או טעינת הגרסה מהשרת." description={saveError} className="no-print" action={repository.reload && <Button onClick={() => { void repository.reload!().catch((error) => setToast(error.message)); }}>טען גרסה מהשרת</Button>} />}

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

        <Card size="small" className="no-print">
          <details className="recurring-settings">
            <summary>שיבוצים קבועים בכל שבוע</summary>
            <Typography.Paragraph type="secondary">
              בחרו יום ומשמרת והגדירו מי משובץ בקביעות. בשמירה האנשים שנבחרו מתווספים לכל המשמרות המתאימות בכל התקופות, גם לצד שיבוצים קיימים. לאחר מכן אפשר להחליף חד־פעמית בלחיצה על המשמרת בלוח.
            </Typography.Paragraph>
            <div className="recurring-grid">
              {DAYS.map((day, dayIndex) => <div key={day}>
                <Typography.Text strong>{day}</Typography.Text>
                {getShiftsForDay(dayIndex).map((shift) => <Button key={shift} block className="recurring-button" onClick={() => openAssignment(0, dayIndex, shift, true)}>
                  <span><strong>{SHIFT_META[shift].shortLabel}</strong><br />{(data.recurring[`${dayIndex}:${shift}`] ?? []).map((id) => staffById.get(id)?.name).filter(Boolean).join(", ") || "הגדרת אנשים קבועים"}</span>
                </Button>)}
              </div>)}
            </div>
          </details>
        </Card>

        <AvailabilityPanel staff={data.staff} entries={data.unavailability}
          onAdd={(entry) => setData((current) => ({ ...current, unavailability: [...current.unavailability, entry] }), "הוספת חוסר זמינות")}
          onRemove={(id) => setData((current) => ({ ...current, unavailability: current.unavailability.filter((entry) => entry.id !== id) }), "הסרת חוסר זמינות")} />
        <WorkloadSummary data={data} />
        {conflicts.length > 0 && <Alert className="no-print" type="warning" showIcon title={`${conflicts.length} שיבוצים מתנגשים עם חוסר זמינות בתקופה המוצגת`} description={
          <details><summary>הצג שיבוצים לבדיקה</summary><Space wrap>{conflicts.map((conflict) => <Button key={`${conflict.date}:${conflict.shift}:${conflict.staffId}`} onClick={() => openAssignment(conflict.week, conflict.day, conflict.shift)}>
            {conflict.name} · {shortDateFormatter.format(parseDate(conflict.date))} · {SHIFT_META[conflict.shift].shortLabel}
          </Button>)}</Space></details>
        } />}
        <Alert className="guide-notice" type="info" showIcon title="מדריכים יקרים, כל מי שרוצה להחליף משמרת שיעדכן אותי ויסמן בדף." />

        <WeekBoard period={period} periodStart={periodStart} staff={data.staff} recurring={data.recurring} unavailability={data.unavailability} onEdit={openAssignment} onNote={updateWeekNote} />
      </Layout.Content>

      <AssignmentDialog editing={editing} editingDate={editingDate} assignments={period.assignments}
        staffCount={data.staff.length} visibleStaff={visibleStaff} unavailability={data.unavailability} draftIds={draftIds}
        staffSearch={staffSearch} dialogStaffName={dialogStaffName} setEditing={setEditing} setStaffSearch={setStaffSearch}
        setDialogStaffName={setDialogStaffName} toggleDraftId={toggleDraftId} saveAssignment={saveAssignment}
        restoreRecurring={restoreRecurring} handleDialogAddStaff={handleDialogAddStaff} />
    </Layout>
  );
}

export default App;
