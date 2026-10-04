import{NextResponse}from'next/server';import{requireUser}from'@/lib/server/auth';import{jsonError}from'@/lib/server/http';
export async function DELETE(request:Request,context:{params:Promise<{id:string}>}){
 const{id}=await context.params;if(!/^[0-9a-f-]{36}$/i.test(id))return jsonError(400,'REQUEST_INVALID','Invalid request.');
 try{const{supabase}=await requireUser(request);const{error}=await supabase.rpc('cancel_ai_request',{p_request_id:id});if(error)return jsonError(503,'AI_LOCK_UNAVAILABLE','Unable to cancel. Please retry.',true);return NextResponse.json({cancelled:true});}catch{return jsonError(401,'UNAUTHENTICATED','Please sign in.');}
}
