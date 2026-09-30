import { expect, it } from 'vitest';
import { candidateSummary } from './candidate-status';
const yes = {submitted:true,status:'green'};
it('requires every member to explicitly confirm the full interval',()=>{
  expect(candidateSummary([yes,yes,yes],3)).toEqual({available:3,missing:0,common:true});
  for(const person of [{submitted:false,status:'green'},{...yes,hasUnknown:true},{...yes,hasConflict:true},{submitted:true,status:'yellow'}]) expect(candidateSummary([yes,yes,person],3).common).toBe(false);
});
it('cannot report shared availability for missing members or an empty group',()=>{
  expect(candidateSummary([yes,yes],3)).toEqual({available:2,missing:1,common:false});
  expect(candidateSummary([],0).common).toBe(false);
});
