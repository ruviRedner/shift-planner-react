import { useState } from 'react';
import { App, Button, Card, Flex, Form, Input, Space, Tag, Typography } from 'antd';
import { createId } from '../domain/planner';
import type { PlannerData } from '../domain/planner';
import { deleteResident } from '../domain/laundry';

export function ResidentsPanel({ data, onChange }: { data: PlannerData; onChange: (update: (data: PlannerData) => PlannerData, label: string) => void }) {
  const [name, setName] = useState('');
  const { modal, message } = App.useApp();
  const residents = data.residents ?? [];
  function add() {
    const normalized = name.trim().replace(/\s+/g, ' ');
    if (!normalized) return;
    if (residents.some((resident) => resident.name.localeCompare(normalized, 'he', { sensitivity: 'base' }) === 0)) {
      void message.info('השם כבר קיים ברשימת הדיירים'); return;
    }
    const resident = { id: createId(), name: normalized };
    onChange((current) => ({ ...current, residents: [...(current.residents ?? []), resident] }), 'הוספת דייר');
    setName('');
  }
  return <Card size="small" className="no-print residents-panel" title={<Space>דיירים<Tag>{residents.length}</Tag></Space>}>
    <Form onFinish={add} className="staff-form"><Space.Compact block>
      <Input value={name} maxLength={50} onChange={(event) => setName(event.target.value)} aria-label="שם הדייר" placeholder="שם הדייר" autoComplete="off" />
      <Button type="primary" htmlType="submit" disabled={!name.trim()}>הוסף דייר</Button>
    </Space.Compact></Form>
    <Flex gap="small" wrap className="resident-list">
      {residents.length === 0 && <Typography.Text type="secondary">הוסיפו את שמות הדיירים ובחרו למי עושים כביסה בשורה שמתחת לכל שבוע.</Typography.Text>}
      {residents.map((resident) => <Tag key={resident.id} closable onClose={(event) => {
        event.preventDefault();
        void (async () => {
          const confirmed = await modal.confirm({ title: 'הסרת דייר', content: `להסיר את ${resident.name} ואת שיבוצי הכביסה שלו?`, okText: 'הסר', cancelText: 'ביטול', okButtonProps: { danger: true } });
          if (confirmed) onChange((current) => deleteResident(current, resident.id), 'הסרת דייר');
        })();
      }}>{resident.name}</Tag>)}
    </Flex>
  </Card>;
}
