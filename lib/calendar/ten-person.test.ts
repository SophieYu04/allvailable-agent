import { describe, expect, it } from "vitest";
import { scoreCandidates } from "@/lib/scoring";
const candidate={id:"dinner",startsAt:"2035-10-03T11:00:00Z",endsAt:"2035-10-03T12:00:00Z"};
const keys=["2035-10-03-19:00","2035-10-03-19:30"];
const people=()=>Array.from({length:10},(_,i)=>({participantId:String(i),displayName:"Guest "+i,submitted:true,active:true,isPriority:i===0,statuses:Object.fromEntries(keys.map(k=>[k,"green"])),slots:Object.fromEntries(keys.map(k=>[k,2 as 0|1|2]))}));
describe("ten-person whole-interval scheduling",()=>{
 it("scores ten submitted replies with integer weights",()=>{const [result]=scoreCandidates([candidate],people(),{dinner:keys});expect(result.totalScore).toBe(20);expect(result.priorityScore).toBe(2);expect(result.participantScores).toHaveLength(10);});
 it("keeps unknown, tentative, busy and unsubmitted distinct",()=>{const p=people();p[0].statuses[keys[1]]="unknown";p[0].slots[keys[1]]=0;p[1].statuses[keys[1]]="yellow";p[1].slots[keys[1]]=1;p[2].statuses[keys[0]]="red";p[2].slots[keys[0]]=0;p[3].submitted=false;p[4].active=false;const [r]=scoreCandidates([candidate],p,{dinner:keys});expect(r.totalScore).toBe(11);expect(r.participantScores.map(x=>x.status).slice(0,4)).toEqual(["unknown","yellow","red","unsubmitted"]);expect(r.participantScores).toHaveLength(9);});
});
