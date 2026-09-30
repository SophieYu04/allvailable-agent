import JoinByCode from "@/components/dining/JoinByCode";
export default async function JoinCodePage({searchParams}:{searchParams:Promise<{code?:string}>}) {
 const {code}=await searchParams;
 return <JoinByCode initialCode={code && /^\d{6}$/.test(code)?code:''}/>;
}
