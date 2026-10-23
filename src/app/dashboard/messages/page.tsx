import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { MessagesView } from "@/components/dashboard/messages-view";
import { requireBusiness } from "@/server/auth";
import { listMessages } from "@/server/dashboard";

export const metadata: Metadata = { title: "Messages" };

const KINDS = ["confirmation", "reminder_24h", "reminder_2h", "cancellation", "reschedule"];

export default function MessagesPage(props: PageProps<"/dashboard/messages">) {
  return (
    <Suspense fallback={<div className="m-8 h-[60vh] animate-pulse rounded-panel bg-mist-2" />}>
      <Messages {...props} />
    </Suspense>
  );
}

async function Messages({ searchParams }: PageProps<"/dashboard/messages">) {
  await connection();
  const sp = await searchParams;
  const kind = typeof sp.kind === "string" && KINDS.includes(sp.kind) ? sp.kind : null;
  const page = Math.max(1, Number(sp.page) || 1);
  const { db, business } = await requireBusiness();
  const data = await listMessages(db, business, { kind, page });
  return (
    <MessagesView
      {...data}
      kind={kind}
      page={page}
      tz={business.timezone}
      whatsappEnabled={business.whatsappEnabled}
      providers={{ whatsapp: !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID), email: !!process.env.RESEND_API_KEY }}
    />
  );
}
