import {z}from'zod';
export const geometrySchema=z.object({width:z.number().int().min(1).max(1200),height:z.number().int().min(1).max(1200),lines:z.array(z.number().min(0).max(1000)).max(100),blocks:z.array(z.object({x:z.number().min(0).max(1000),top:z.number().min(0).max(1000),bottom:z.number().min(0).max(1000),width:z.number().min(0).max(1000)})).max(100)});
export type CalendarGeometry=z.infer<typeof geometrySchema>;
/** Pixel measurements anchor the model's date/title interpretation to real edges. */
export function measureCalendarPixels(pixels:Uint8ClampedArray,width:number,height:number):CalendarGeometry{
 const found:Array<{x:number;end:number;top:number;bottom:number;r:number;g:number;b:number}>=[];const rows:number[]=[];
 for(let y=0;y<height;y++){
  let gray=0,start=-1,runColor=[0,0,0];
  const add=(end:number)=>{if(start<0||end-start<25)return;const [r,g,b]=runColor;const previous=found.find(block=>y-block.bottom<=1&&y>=block.bottom&&start<block.end&&end>block.x);if(previous){previous.x=Math.min(previous.x,start);previous.end=Math.max(previous.end,end);previous.bottom=y;}else if(found.length<500)found.push({x:start,end,top:y,bottom:y,r,g,b});};
  for(let x=0;x<width;x++){
   const i=(y*width+x)*4,r=pixels[i],g=pixels[i+1],b=pixels[i+2],max=Math.max(r,g,b),min=Math.min(r,g,b);
   if(max-min<14&&min>125&&max<247)gray++;
   const colored=max-min>35&&min<220&&max>80;
   if(colored){if(start<0){start=x;runColor=[r,g,b];}else if(Math.abs(r-runColor[0])+Math.abs(g-runColor[1])+Math.abs(b-runColor[2])>70){add(x);start=x;runColor=[r,g,b];}}
   else if(start>=0){add(x);start=-1;}
  }if(start>=0)add(width);if(gray/width>.38)rows.push(y);
 }
 const groups:number[][]=[];rows.forEach(y=>{const previous=groups.at(-1);if(previous&&y-previous.at(-1)!<=3)previous.push(y);else groups.push([y]);});
 return {width,height,lines:groups.map(g=>g.reduce((a,b)=>a+b,0)/g.length/height*1000).slice(0,100),blocks:found.filter(b=>b.end-b.x>=45&&b.bottom-b.top>=8&&b.end-b.x<width*.9&&b.bottom-b.top<height*.8).map(b=>({x:b.x/width*1000,top:b.top/height*1000,bottom:(b.bottom+1)/height*1000,width:(b.end-b.x)/width*1000})).sort((a,b)=>a.top-b.top||a.x-b.x).slice(0,100)};
}
export async function readCalendarGeometry(file:Blob):Promise<CalendarGeometry|null>{
 try{const bitmap=await createImageBitmap(file);const scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const context=canvas.getContext('2d',{willReadFrequently:true});if(!context){bitmap.close();return null;}context.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();return measureCalendarPixels(context.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);}catch{return null;}
}
