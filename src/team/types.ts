import type { ShiftType, StaffMember, Unavailability } from "../domain/planner";
export type User = { id: string; username: string; role: "admin" | "staff"; staffId?: string; disabled: boolean };
export type SwapRequest = { id: string; periodStart: string; key: string; date: string; shift: ShiftType; requesterId: string; requesterName?: string; note: string; status: "open" | "approved" | "rejected" | "cancelled"; offers: string[]; approvedId?: string; createdAt: string; resolvedAt?: string };
export type PersonalData = { staffId: string; start: string; name: string; shifts: { key: string; date: string; shift: ShiftType }[]; unavailability: Unavailability[]; requests: SwapRequest[] };
export type TeamData = { users: User[]; requests: SwapRequest[]; staff: StaffMember[]; audit: { id: string; at: string; actor: string; action: string }[] };
