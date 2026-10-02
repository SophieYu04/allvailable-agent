import {describe,it,expect} from 'vitest';
import {timeAtCalendarEdge} from './calendar-axis';
describe('calendar edge grounding',()=>{
 const axis=[{time:'09:00',y:100},{time:'10:00',y:200},{time:'11:00',y:300}];
 it('uses actual boundaries including half hours',()=>{
  expect(timeAtCalendarEdge(100,axis)).toBe('09:00');
  expect(timeAtCalendarEdge(250,axis)).toBe('10:30');
  expect(timeAtCalendarEdge(125,axis)).toBe('09:15');
  expect(timeAtCalendarEdge(300,axis)).toBe('11:00');
 });
 it('does not invent times outside readable axis or ambiguous edges',()=>{
  expect(timeAtCalendarEdge(350,axis)).toBeNull();
  expect(timeAtCalendarEdge(112.5,axis)).toBeNull();
  expect(timeAtCalendarEdge(null,axis)).toBeNull();
 });
});
