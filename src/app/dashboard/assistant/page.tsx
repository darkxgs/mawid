import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { AssistantChat } from "@/components/dashboard/assistant-chat";
import { requireBusiness } from "@/server/auth";

export const metadata: Metadata = { title: "Assistant" };

export default function AssistantPage() {
  return (
    <Suspense fallback={<div className="m-8 h-[70vh] animate-pulse rounded-panel bg-mist-2" />}>
      <Assistant />
    </Suspense>
  );
}

async function Assistant() {
  await connection();
  const { business } = await requireBusiness();
  return <AssistantChat businessName={business.name} />;
}
