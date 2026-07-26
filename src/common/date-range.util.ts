export function resolveDateRange(query?: { range?: string; startDate?: string; endDate?: string }): { gte: Date; lte?: Date } | undefined {
  const { range, startDate, endDate } = query || {};
  const now = new Date();

  if (range === 'today') {
    return { gte: new Date(new Date(now).setHours(0, 0, 0, 0)) };
  }
  if (range === 'yesterday') {
    const start = new Date(now); start.setDate(start.getDate() - 1); start.setHours(0, 0, 0, 0);
    const end = new Date(now); end.setDate(end.getDate() - 1); end.setHours(23, 59, 59, 999);
    return { gte: start, lte: end };
  }
  if (range === 'week') {
    const start = new Date(now); start.setDate(start.getDate() - 7); start.setHours(0, 0, 0, 0);
    return { gte: start };
  }
  if (range === 'month') {
    return { gte: new Date(now.getFullYear(), now.getMonth(), 1) };
  }
  if (range === 'custom' && startDate && endDate) {
    return { gte: new Date(startDate), lte: new Date(endDate + 'T23:59:59.999Z') };
  }
  return undefined;
}
