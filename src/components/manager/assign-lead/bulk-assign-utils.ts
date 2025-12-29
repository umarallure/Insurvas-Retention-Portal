export type AllocationInput = {
  agentId: string;
  percent: number;
};

export type AllocationComputed = AllocationInput & {
  count: number;
};

function clampPercent(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

export function normalizeAllocations(input: AllocationInput[]): AllocationInput[] {
  return input
    .map((a) => ({ agentId: a.agentId, percent: clampPercent(a.percent) }))
    .filter((a) => a.agentId);
}

export function isValidPercentTotal(allocations: AllocationInput[]): boolean {
  const total = allocations.reduce((acc, a) => acc + clampPercent(a.percent), 0);
  return total > 0 && total <= 100;
}

export function computeAllocationCounts(totalLeads: number, allocations: AllocationInput[]): AllocationComputed[] {
  const cleaned = normalizeAllocations(allocations);
  if (totalLeads <= 0 || cleaned.length === 0) {
    return cleaned.map((a) => ({ ...a, count: 0 }));
  }

  const pTotal = cleaned.reduce((acc, a) => acc + a.percent, 0);
  if (pTotal <= 0) {
    return cleaned.map((a) => ({ ...a, count: 0 }));
  }

  const cappedTotal = Math.min(100, pTotal);
  const assignableLeads = Math.floor((totalLeads * cappedTotal) / 100);
  if (assignableLeads <= 0) {
    return cleaned.map((a) => ({ ...a, count: 0 }));
  }

  const normalized = cleaned.map((a) => ({ ...a, percent: (a.percent / pTotal) * 100 }));

  const raw = normalized.map((a) => ({
    agentId: a.agentId,
    percent: a.percent,
    rawCount: (assignableLeads * a.percent) / 100,
  }));

  const base = raw.map((r) => Math.floor(r.rawCount));
  let assigned = base.reduce((acc, n) => acc + n, 0);
  let remaining = Math.max(0, assignableLeads - assigned);

  const remainderOrder = raw
    .map((r, idx) => ({ idx, frac: r.rawCount - Math.floor(r.rawCount) }))
    .sort((a, b) => b.frac - a.frac);

  const counts = [...base];
  let i = 0;
  while (remaining > 0 && remainderOrder.length > 0) {
    counts[remainderOrder[i % remainderOrder.length].idx] += 1;
    remaining -= 1;
    i += 1;
  }

  assigned = counts.reduce((acc, n) => acc + n, 0);
  if (assigned !== assignableLeads && counts.length > 0) {
    counts[counts.length - 1] += assignableLeads - assigned;
  }

  return normalized.map((a, idx) => ({ ...a, count: counts[idx] ?? 0 }));
}

export function computeEvenAllocationCounts(totalLeads: number, allocations: AllocationInput[]): AllocationComputed[] {
  // allocations used only for agent list (agentId)
  const cleaned = allocations.map((a) => ({ agentId: a.agentId, percent: 0 } as AllocationInput));
  if (totalLeads <= 0 || cleaned.length === 0) {
    return cleaned.map((a) => ({ ...a, count: 0 }));
  }

  const n = cleaned.length;
  const base = Math.floor(totalLeads / n);
  let remainder = totalLeads - base * n;

  const counts: number[] = Array(n).fill(base);
  let idx = 0;
  while (remainder > 0) {
    counts[idx] += 1;
    remainder -= 1;
    idx = (idx + 1) % n;
  }

  return cleaned.map((a, i) => ({ agentId: a.agentId, percent: 0, count: counts[i] }));
}

export function buildLeadIdPlan(leadIds: string[], allocations: AllocationInput[]): Array<{ lead_id: string; assignee_profile_id: string }> {
  const computed = computeAllocationCounts(leadIds.length, allocations);
  const plan: Array<{ lead_id: string; assignee_profile_id: string }> = [];

  let cursor = 0;
  for (const a of computed) {
    for (let i = 0; i < a.count; i += 1) {
      const leadId = leadIds[cursor];
      if (!leadId) break;
      plan.push({ lead_id: leadId, assignee_profile_id: a.agentId });
      cursor += 1;
    }
  }

  return plan;
}

export function buildDealIdPlan(dealIds: number[], allocations: AllocationInput[], evenDistribution = false): Array<{ deal_id: number; assignee_profile_id: string }> {
  const computed = evenDistribution ? computeEvenAllocationCounts(dealIds.length, allocations) : computeAllocationCounts(dealIds.length, allocations);
  const plan: Array<{ deal_id: number; assignee_profile_id: string }> = [];

  let cursor = 0;
  for (const a of computed) {
    for (let i = 0; i < a.count; i += 1) {
      const dealId = dealIds[cursor];
      if (dealId === undefined || dealId === null) break;
      plan.push({ deal_id: dealId, assignee_profile_id: a.agentId });
      cursor += 1;
    }
  }

  return plan;
}
