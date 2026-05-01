import { notFound } from "next/navigation";

import { ResearchProgressPage } from "@/components/research/research-progress-page";

const SESSION_ID_PATTERN = /^[\w-]{1,64}$/;

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!SESSION_ID_PATTERN.test(id)) notFound();
  return <ResearchProgressPage sessionId={id} />;
}
