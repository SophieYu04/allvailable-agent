import DiningDetail from "@/components/dining/DiningDetail";
export default async function JoinPage({params}:{params:Promise<{token:string}>}) { const {token}=await params; return <DiningDetail token={token}/>; }
