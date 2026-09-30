import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runPlanningAgent } from './planning-agent';

const draft = { name: '聚餐', dateStart: '2030-01-05', dateEnd: '2030-01-05', dailyStart: '19:00', dailyEnd: '21:00', duration: 60, deadline: '2030-01-04T12:00:00+08:00' };
const cells = { '2030-01-05-19:00': 'green', '2030-01-05-19:30': 'green', '2030-01-05-20:00': 'green', '2030-01-05-20:30': 'green' } as const;
const participants = [1, 2, 3].map((id) => ({ id: String(id), submitted: true, cells: { ...cells } }));
const parse = vi.fn(async () => ({ input: { ...draft }, questions: [] }));
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2030-01-01T00:00:00Z')); parse.mockClear(); });
afterEach(() => { vi.useRealTimers(); });

describe('bounded planning agent', () => {
  it('returns three common intervals for review without sending availability to the model', async () => {
    const input = { request: '幫我約聚餐', participants };
    const snapshot = JSON.stringify(input);
    const result = await runPlanningAgent(input, parse);
    expect(result.status).toBe('ready_for_review');
    expect(result.requiresConfirmation).toBe(true);
    expect(result.candidates).toHaveLength(3);
    expect(result.candidates[0]).toMatchObject({ id: '2030-01-05-19:00', availableCount: 3 });
    expect(parse).toHaveBeenCalledExactlyOnceWith('幫我約聚餐', null);
    expect(JSON.stringify(input)).toBe(snapshot);
    expect(JSON.stringify(result)).not.toContain('participantScores');
  });
  it('asks about a missing deadline before looking for candidates', async () => {
    const result = await runPlanningAgent({ request: '吃飯', participants }, async () => ({ input: { ...draft, deadline: null }, questions: [] }));
    expect(result.status).toBe('needs_clarification');
    expect(result.questions.join()).toContain('回覆截止');
    expect(result.candidates).toEqual([]);
  });
  it('passes a previous draft to the next turn for clarification', async () => {
    await runPlanningAgent({ request: '下午六點開始', existing: draft, participants }, parse);
    expect(parse).toHaveBeenCalledExactlyOnceWith('下午六點開始', draft);
  });
  it('never treats an unsubmitted friend as available', async () => {
    const result = await runPlanningAgent({ request: '吃飯', participants: participants.map((person, index) => ({ ...person, submitted: index !== 2 })) }, parse);
    expect(result).toMatchObject({ status: 'waiting_for_availability', missingSubmissions: 1, candidates: [] });
  });
  it('requires participants rather than claiming an empty intersection is available', async () => {
    expect(await runPlanningAgent({ request: '吃飯' }, parse)).toMatchObject({ status: 'waiting_for_availability', candidates: [] });
  });
  it.each(['unknown', 'yellow', 'red'] as const)('excludes a whole interval when any half-hour is %s', async (status) => {
    const unavailable = { ...cells, '2030-01-05-19:30': status, '2030-01-05-20:00': status };
    const result = await runPlanningAgent({ request: '吃飯', participants: [participants[0], { id: 'other', submitted: true, cells: unavailable }] }, parse);
    expect(result).toMatchObject({ status: 'no_common_time', candidates: [] });
  });
  it('does not invent blank availability', async () => {
    expect(await runPlanningAgent({ request: '吃飯', participants: [{ id: 'a', submitted: true, cells: {} }] }, parse))
      .toMatchObject({ status: 'no_common_time', candidates: [] });
  });
  it('rejects duplicate people and oversized prompts before consuming credits', async () => {
    await expect(runPlanningAgent({ request: '吃飯', participants: [participants[0], participants[0]] }, parse)).rejects.toThrow();
    await expect(runPlanningAgent({ request: 'x'.repeat(6001), participants }, parse)).rejects.toThrow();
    expect(parse).not.toHaveBeenCalled();
  });
  it('fails once without retrying or fabricating a plan when the provider fails', async () => {
    const failing = vi.fn().mockRejectedValue(new Error('NEBIUS_402'));
    await expect(runPlanningAgent({ request: '吃飯', participants }, failing)).rejects.toThrow('NEBIUS_402');
    expect(failing).toHaveBeenCalledTimes(1);
  });
  it('handles midnight end times as real instants', async () => {
    const result = await runPlanningAgent({ request: '深夜聚會', participants: [{ id: 'a', submitted: true, cells: { '2030-01-05-23:00': 'green', '2030-01-05-23:30': 'green' } }] }, async () => ({ input: { ...draft, dailyStart: '23:00', dailyEnd: '24:00' }, questions: [] }));
    expect(result.candidates[0]).toMatchObject({ startsAt: '2030-01-05T23:00:00+08:00', endsAt: '2030-01-05T16:00:00.000Z' });
  });
});
