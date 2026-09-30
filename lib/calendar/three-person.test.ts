import { expect, it } from 'vitest';
import { buildPreview } from '../server/calendar-imports';
import { scoreCandidates, type Submission } from '../scoring';
import { candidateSummary } from './candidate-status';
// Synthetic, schema-valid extraction fixtures. This is NOT live AI or browser E2E evidence.
it('combines three confirmed drafts, excludes an unsubmitted friend and reports conflicts',()=>{
 const date='2026-10-03';
 const submissions:Submission[]=['19:00','19:30','20:00'].map((start,index)=>{
   const extraction={sources:[{id:'s',kind:index===1?'schedule_voice':'calendar',reason:null}],events:[{id:'e',sourceIds:['s'],label:null,intent:'available',startDate:date,endDate:date,startTime:start,endTime:'21:00',sourceTimezone:'Asia/Taipei',allDay:false,recurrence:null,unresolved:[],userConfirmed:true}],visibleRanges:[],questions:[]};
   const preview=buildPreview(extraction,{startDate:date,endDate:date,slotStart:'18:00',slotEnd:'22:00',currentCells:{}});
   return {participantId:String(index),displayName:String(index),active:true,submitted:true,isPriority:false,statuses:Object.fromEntries(preview.changes.map(c=>[c.key,c.after])),slots:Object.fromEntries(preview.changes.map(c=>[c.key,2 as const]))};
 });
 const candidates=['19:00','19:30','20:00'].map((start,i)=>({id:String(i),startsAt:`${date}T${start}:00+08:00`,endsAt:`${date}T${['20:00','20:30','21:00'][i]}:00+08:00`}));
 const cells={'0':[`${date}-19:00`,`${date}-19:30`],'1':[`${date}-19:30`,`${date}-20:00`],'2':[`${date}-20:00`,`${date}-20:30`]};
 const confirmed=scoreCandidates(candidates,submissions,cells);
 expect(confirmed[0].id).toBe('2');expect(confirmed.filter(c=>candidateSummary(c.participantScores,3).common)).toHaveLength(1);
 submissions[2].submitted=false;
 expect(scoreCandidates(candidates,submissions,cells).some(c=>candidateSummary(c.participantScores,3).common)).toBe(false);
 submissions[2].submitted=true;submissions[2].slots[`${date}-20:30`]=0;submissions[2].statuses![`${date}-20:30`]='red';
 expect(scoreCandidates(candidates,submissions,cells).some(c=>candidateSummary(c.participantScores,3).common)).toBe(false);
});
