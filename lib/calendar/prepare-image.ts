export function resizedDimensions(width:number,height:number,maxEdge=2048){const scale=Math.min(1,Math.max(maxEdge/Math.max(width,height),768/Math.min(width,height)));return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};}
/** Lossless PNG, intact headers/axes; retain the original when conversion is larger. */
export async function prepareImage(file:File):Promise<File>{
 try{const bitmap=await createImageBitmap(file);const size=resizedDimensions(bitmap.width,bitmap.height);
 if(size.width===bitmap.width&&size.height===bitmap.height){bitmap.close();return file;}
 const canvas=document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;const context=canvas.getContext('2d');if(!context){bitmap.close();return file;}
 context.drawImage(bitmap,0,0,size.width,size.height);bitmap.close();const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/png'));
 return blob&&blob.size<file.size?new File([blob],file.name.replace(/\.[^.]+$/,'.png'),{type:'image/png'}):file;
 }catch{return file;}
}
