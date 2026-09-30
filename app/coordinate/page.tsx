import { redirect } from 'next/navigation';
export default async function Coordinate({searchParams}:{searchParams:Promise<{gathering?:string;invite?:string}>}){
 const {gathering,invite}=await searchParams;
 if(invite) redirect(`/join/${encodeURIComponent(invite)}`);
 if(gathering) redirect(`/gatherings/${encodeURIComponent(gathering)}`);
 redirect('/');
}
