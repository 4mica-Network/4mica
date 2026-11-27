export interface FinanceBadgeState {
  pendingApprovals: number;
  unacknowledgedAlerts: number;
  more: { approvals: boolean; alerts: boolean };
}
