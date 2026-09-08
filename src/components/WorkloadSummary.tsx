import { Card, Table, Typography } from "antd";
import type { PlannerData } from "../domain/planner";
import { workloadForPeriod } from "../domain/insights";

export function WorkloadSummary({ data }: { data: PlannerData }) {
  return <Card size="small" className="no-print">
    <details className="recurring-settings">
      <summary>סיכום עומס בתקופה המוצגת</summary>
      <Typography.Paragraph type="secondary">מספר משמרות לכל אדם בשבועיים המוצגים, כולל שיבוצים קבועים והחלפות. שישי־שבת נספרת כמשמרת אחת; מוצ״ש נכלל בלילות.</Typography.Paragraph>
      <Table rowKey="id" size="small" pagination={false} scroll={{ x: 480 }} dataSource={workloadForPeriod(data)} columns={[
        { title: "שם", dataIndex: "name" },
        { title: "צהריים", dataIndex: "afternoon" },
        { title: "לילה", dataIndex: "night" },
        { title: "שישי־שבת", dataIndex: "shabbat" },
        { title: "סה״כ", dataIndex: "total", defaultSortOrder: "descend", sorter: (a, b) => a.total - b.total },
      ]} />
    </details>
  </Card>;
}
