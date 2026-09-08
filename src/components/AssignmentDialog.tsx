import { Alert, Button, Checkbox, Empty, Flex, Form, Input, Modal, Space, Typography } from "antd";
import { PlusOutlined, UndoOutlined } from "@ant-design/icons";
import { DAYS, SHIFT_META, assignmentKey, fullDateFormatter, toDateKey } from "../domain/planner";
import type { EditingShift, StaffMember, Unavailability } from "../domain/planner";
import { unavailableForShift } from "../domain/insights";

type Props = {
  editing: EditingShift | null; editingDate: Date | null; assignments: Record<string, string[]>;
  staffCount: number; visibleStaff: StaffMember[]; unavailability: Unavailability[]; draftIds: string[];
  staffSearch: string; dialogStaffName: string;
  setEditing: (editing: EditingShift | null) => void; setStaffSearch: (value: string) => void;
  setDialogStaffName: (value: string) => void; toggleDraftId: (id: string) => void;
  saveAssignment: () => void; restoreRecurring: () => void; handleDialogAddStaff: () => void;
};
export function AssignmentDialog({ editing, editingDate, assignments, staffCount, visibleStaff, unavailability, draftIds, staffSearch, dialogStaffName, setEditing, setStaffSearch, setDialogStaffName, toggleDraftId, saveAssignment, restoreRecurring, handleDialogAddStaff }: Props) {
  return (
      <Modal open={Boolean(editing)} onCancel={() => setEditing(null)} onOk={saveAssignment} title={editing ? `${editing.recurring ? "שיבוץ קבוע · " : ""}${SHIFT_META[editing.shiftType].label}` : "שיבוץ משמרת"} okText={editing?.recurring ? "שמור קביעות" : "שמור לשבוע זה בלבד"} cancelText="ביטול" destroyOnHidden>
        <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
          <Typography.Text type="secondary">{editing && editingDate ? `${DAYS[editing.dayIndex]} · ${editing.recurring ? "בכל שבוע" : fullDateFormatter.format(editingDate)}` : ""}</Typography.Text>
          <Alert type="info" showIcon title={editing?.recurring ? "בשמירה השמות שנבחרו יתווספו לכל השבועות, גם למשמרות עם שיבוץ ידני או למשמרות שרוקנו. אנשים שכבר שובצו יישארו. ביטול הבחירות מסיר את הקביעות, אך אינו מוחק שמות משיבוצים ידניים." : "השינוי יישמר למשמרת זו בלבד. הקביעות בשאר השבועות לא תשתנה. אפשר גם לבטל את כל הבחירות ולהשאיר את המשמרת ריקה."} />
          {editing && !editing.recurring && Object.hasOwn(assignments, assignmentKey(editing.weekIndex, editing.dayIndex, editing.shiftType)) && <Button icon={<UndoOutlined />} onClick={restoreRecurring}>חזור לשיבוץ הקבוע</Button>}
          {staffCount > 0 && <Input.Search allowClear value={staffSearch} onChange={(event) => setStaffSearch(event.target.value)} placeholder="חיפוש איש צוות" aria-label="חיפוש איש צוות" />}
          <Typography.Text type="secondary">{draftIds.length} נבחרו</Typography.Text>
          {editing && !editing.recurring && editingDate && draftIds.some((id) => unavailableForShift(unavailability, id, toDateKey(editingDate), editing.shiftType)) && <Alert type="warning" showIcon title="נבחרו אנשים שאינם זמינים בתאריך זה. אפשר לשנות את הבחירה או לשמור בכל זאת." />}
          <Flex vertical gap="small" className="assignment-options">
            {visibleStaff.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={staffCount ? "לא נמצאו שמות" : "הוסיפו איש צוות כדי לשבץ"} /> : visibleStaff.map((member) => <Checkbox key={member.id} checked={draftIds.includes(member.id)} onChange={() => toggleDraftId(member.id)}>{member.name}{editing && !editing.recurring && editingDate && unavailableForShift(unavailability, member.id, toDateKey(editingDate), editing.shiftType) && <Typography.Text type="danger"> · לא זמין/ה</Typography.Text>}</Checkbox>)}
          </Flex>
          <Form onFinish={handleDialogAddStaff}>
            <Space.Compact block>
              <Input value={dialogStaffName} maxLength={50} autoComplete="off" onChange={(event) => setDialogStaffName(event.target.value)} placeholder="שם חדש שלא נמצא ברשימה" aria-label="הוספת איש צוות חדש" />
              <Button htmlType="submit" icon={<PlusOutlined />} disabled={!dialogStaffName.trim()}>הוסף ובחר</Button>
            </Space.Compact>
          </Form>
        </Space>
      </Modal>
  );
}
