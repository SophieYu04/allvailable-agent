import DiningDetail from "@/components/dining/DiningDetail";
export default async function GatheringPage({params}:{params:Promise<{id:string}>}) { const {id}=await params; return <DiningDetail gatheringId={id}/>; }
