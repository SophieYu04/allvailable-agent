import { notFound } from "next/navigation";
import LocalWorkflowPreview from "@/components/dining/LocalWorkflowPreview";
export default function PreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <LocalWorkflowPreview/>;
}
