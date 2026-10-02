import {it,expect}from'vitest';
import{measureCalendarPixels}from'./image-geometry';
it('keeps a colored event together across text and measures grid edges',()=>{
 const width=200,height=100,pixels=new Uint8ClampedArray(width*height*4).fill(255);
 const paint=(x:number,y:number,color:number[])=>pixels.set([...color,255],(y*width+x)*4);
 for(const y of [10,40,70,99])for(let x=0;x<width;x++)paint(x,y,[220,220,220]);
 for(let y=40;y<70;y++)for(let x=40;x<150;x++)paint(x,y,[100,50,180]);
 for(let y=48;y<53;y++)for(let x=55;x<70;x++)paint(x,y,[240,240,240]);
 const result=measureCalendarPixels(pixels,width,height);
 expect(result.blocks).toHaveLength(1);
 expect(result.blocks[0]).toMatchObject({top:400,bottom:700});
 expect(result.lines).toContain(100);
});
