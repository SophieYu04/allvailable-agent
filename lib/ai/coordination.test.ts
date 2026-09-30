import { describe, expect, it, vi } from 'vitest';
import { validateProposal } from './coordination';
vi.mock('./openai', () => ({ modelRequest: vi.fn(), outputText: vi.fn() }));
const input = { name:'吃飯',dateStart:'2030-01-05',dateEnd:'2030-01-06',dailyStart:'18:00',dailyEnd:'22:00',duration:60,deadline:'2030-01-01T12:00:00+08:00' };
describe('AI proposal validation', () => {
  it('accepts explicit valid fields without writing anything', () => expect(validateProposal(input).questions).toEqual([]));
  it('requires clarification instead of inventing a missing deadline', () => expect(validateProposal({...input,deadline:null}).questions.join()).toContain('回覆截止'));
  it('rejects excessive range and invalid duration', () => expect(validateProposal({...input,dateEnd:'2030-02-01',duration:45}).questions.length).toBeGreaterThanOrEqual(2));
  it('rejects elapsed deadlines', () => expect(validateProposal({...input,deadline:'2020-01-01T00:00:00Z'}).questions.join()).toContain('未來'));
});
