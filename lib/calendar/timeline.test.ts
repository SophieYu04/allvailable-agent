import { expect, it } from 'vitest';
import { timelineMeals, type TimelineMeal } from './timeline';
const row=(id:string,date:string,status='open',host='me'):TimelineMeal=>({id,name:id,date_start:date,date_end:date,status,host_id:host,deadline_at:date+'T00:00:00Z'});
const meals=[row('later','2030-05-03'),row('confirmed','2030-05-02','finalized'),row('draft','2030-05-04','draft'),row('past','2030-04-30'),row('cancelled','2030-05-05','cancelled'),row('guest','2030-05-01','open','friend')];
it('shows upcoming gatherings chronologically including future confirmed ones',()=>{
 expect(timelineMeals(meals,'upcoming','me','2030-05-01').map(x=>x.id)).toEqual(['guest','confirmed','later']);
});
it('keeps host drafts in Hosting and excludes gatherings hosted by others',()=>{
 expect(timelineMeals(meals,'hosting','me','2030-05-01').map(x=>x.id)).toEqual(['confirmed','later','draft']);
});
it('moves cancelled and elapsed gatherings to History without losing records',()=>{
 expect(timelineMeals(meals,'history','me','2030-05-01').map(x=>x.id)).toEqual(['cancelled','past']);
});
