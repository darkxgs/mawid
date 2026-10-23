import { convertToModelMessages, createUIMessageStreamResponse, isStepCount, streamText, toUIMessageStream, type UIMessage } from "ai";
import { after } from "next/server";
import { getDb } from "@/db";
import { readSession } from "@/server/auth";
import { getBusinessById, getCatalog } from "@/server/catalog";
import { makeTools, systemPrompt } from "@/server/assistant";

export const maxDuration = 60;

const MODEL = process.env.MAWID_AI_MODEL ?? "anthropic/claude-haiku-4.5";

export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  const db = await getDb();
  const business = await getBusinessById(db, session.businessId);
  if (!business || business.ownerId !== session.userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { messages }: { messages: UIMessage[] } = await req.json();
  // Keep the request bounded: the last 30 messages are plenty of context.
  const recent = messages.slice(-30);
  const catalog = await getCatalog(db, business);
  const ctx = { db, business, catalog, now: new Date(), defer: (fn: () => Promise<unknown>) => after(fn) };
  const tools = makeTools(ctx);

  const result = streamText({
    model: MODEL,
    system: systemPrompt(ctx),
    messages: await convertToModelMessages(recent),
    tools,
    stopWhen: isStepCount(6),
    toolApproval: {
      bookAppointment: { type: "user-approval", reason: "Creates a booking and messages the customer" },
      cancelAppointment: { type: "user-approval", reason: "Cancels the visit and tells the customer" },
      moveAppointment: { type: "user-approval", reason: "Moves the visit and tells the customer" },
    },
    // Approvals are signed by the server, so a modified client can't forge one.
    experimental_toolApprovalSecret: process.env.AUTH_SECRET ?? `mawid-approvals-${process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "local"}`,
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      tools,
      originalMessages: messages,
      onError: (err) => {
        console.error("[assistant]", err);
        const text = String((err as Error)?.message ?? err);
        if (/api key|unauthori[sz]ed|oidc|credentials|authentication/i.test(text)) return "The assistant isn't connected to an AI provider on this server yet.";
        if (/credit|quota|rate/i.test(text)) return "The assistant is over its usage limit right now. Try again later.";
        return "Something went wrong while answering. Try again.";
      },
    }),
  });
}
