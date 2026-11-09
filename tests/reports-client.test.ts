import { afterEach, expect, it, vi } from 'vitest';
import { createReport, listReports } from '../src/reports/client';
import { REPORT_BUILDING_ID } from '../shared/report-contract';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('GET allows service wake-up while POST keeps its existing timeout and caller abort', async () => {
  const timeouts: number[] = [];
  vi.spyOn(AbortSignal, 'timeout').mockImplementation(value => { timeouts.push(value); return new AbortController().signal; });
  const caller = new AbortController();
  const signals: AbortSignal[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_path: string, options: RequestInit) => { signals.push(options.signal as AbortSignal); return new Response(JSON.stringify({ reports: [], nextCursor: null }), { status: 200, headers: { 'Content-Type': 'application/json' } }); }));
  await expect(listReports(null, caller.signal)).resolves.toEqual({ reports: [], nextCursor: null });
  await expect(createReport({ buildingId: REPORT_BUILDING_ID, passageId: 'lift-a-01', kind: 'lift_unavailable', message: 'fictional test', clientRequestId: '00000000-0000-4000-8000-000000000001' }, caller.signal)).rejects.toThrow('ambiguous');
  expect(timeouts).toEqual([70_000, 8_000]); caller.abort(); expect(signals.every(signal => signal.aborted)).toBe(true);
});
