import {expect,it} from 'vitest';import {resizedDimensions,prepareImage} from './prepare-image';
it('bounds large uploads without cropping date headers or distorting the axes',()=>{expect(resizedDimensions(4000,2000)).toEqual({width:2048,height:1024});expect(resizedDimensions(900,1200)).toEqual({width:900,height:1200});expect(resizedDimensions(1080,6000)).toEqual({width:768,height:4267});});
it('retains the original when resizing is unavailable',async()=>{const file=new File(['fixture'],'calendar.png',{type:'image/png'});expect(await prepareImage(file)).toBe(file);});
