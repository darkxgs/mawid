import { describe, expect, it } from "vitest";
import { customerQuery, findTime, understand, understandReply } from "@/lib/assistant/understand";

const ctx = {
  today: "2026-10-23", // a Friday
  services: [
    { id: "checkup", name: "Check-up & cleaning", nameAr: "فحص وتنظيف" },
    { id: "whitening", name: "Teeth whitening", nameAr: "تبييض الأسنان" },
    { id: "kids", name: "Children's check-up", nameAr: "فحص الأطفال" },
    { id: "aligner", name: "Aligner check-in", nameAr: "متابعة التقويم الشفاف" },
  ],
  staff: [
    { id: "omar", name: "Dr. Omar Al Mansouri", nameAr: "د. عمر المنصوري" },
    { id: "layla", name: "Dr. Layla Haddad", nameAr: "د. ليلى حداد" },
  ],
};
const u = (text: string) => understand(text, ctx);

describe("understanding front-desk questions", () => {
  it("reads free-time questions with a day, a part of the day and a service", () => {
    expect(u("Who's free tomorrow afternoon for a check-up?")).toEqual({ t: "free", serviceId: "checkup", date: "2026-10-24", part: "afternoon" });
    expect(u("any whitening slots thursday?")).toEqual({ t: "free", serviceId: "whitening", date: "2026-10-29" });
    expect(u("في وقت فاضي لتبييض الأسنان بعد بكرة؟")).toEqual({ t: "free", serviceId: "whitening", date: "2026-10-25" });
    expect(u("Free times for the kids check-up")).toEqual({ t: "free", serviceId: "kids" });
  });

  it("reads schedule questions, with or without a person", () => {
    expect(u("What's on today?")).toEqual({ t: "day", date: "2026-10-23" });
    expect(u("What does Dr. Layla have today?")).toEqual({ t: "day", date: "2026-10-23", staffId: "layla" });
    expect(u("مين عنده مواعيد بكرة الصبح؟")).toEqual({ t: "day", date: "2026-10-24", part: "morning" });
    expect(u("جدول د. عمر يوم الأحد")).toEqual({ t: "day", date: "2026-10-25", staffId: "omar" });
    expect(u("next friday")).toEqual({ t: "day", date: "2026-10-30" });
  });

  it("reads questions about the numbers", () => {
    expect(u("How many no-shows did we have last week?")).toEqual({ t: "stats", range: "lastweek" });
    expect(u("how much did we make this month")).toEqual({ t: "stats", range: "month" });
    expect(u("كم غياب الشهر الماضي؟")).toEqual({ t: "stats", range: "lastmonth" });
    // "How many" about a single day is a schedule question.
    expect(u("كم موعد بكرة؟")).toEqual({ t: "day", date: "2026-10-24" });
  });

  it("pulls the name, phone, service and day out of a booking request", () => {
    expect(u("Book Sophie Turner (050 123 4567) for whitening next Thursday afternoon")).toEqual({
      t: "book",
      serviceId: "whitening",
      date: "2026-10-29",
      part: "afternoon",
      phone: "050 123 4567",
      name: "Sophie Turner",
    });
    expect(u("Book a whitening appointment")).toEqual({ t: "book", serviceId: "whitening" });
    expect(u("احجز فحص بكرة الساعة 4")).toEqual({ t: "book", serviceId: "checkup", date: "2026-10-24", time: "16:00" });
  });

  it("sends cancel and move requests through a customer lookup", () => {
    expect(u("Cancel Sophie Turner's appointment")).toEqual({ t: "customer", query: "Sophie Turner", then: "cancel" });
    expect(u("move James to tomorrow")).toEqual({ t: "customer", query: "James", then: "move", date: "2026-10-24" });
    expect(u("الغي موعد 0501234567")).toEqual({ t: "customer", query: "0501234567", then: "cancel" });
    expect(u("Sophie Turner")).toEqual({ t: "customer", query: "Sophie Turner" });
  });

  it("returns nothing for things it doesn't handle", () => {
    expect(u("sing me a song")).toBeNull();
  });

  it("reads times only when they are clearly times", () => {
    expect(findTime("at 3pm")).toBe("15:00");
    expect(findTime("10:30")).toBe("10:30");
    expect(findTime("at 4")).toBe("16:00");
    expect(findTime("الساعة ١١ ص")).toBe("11:00");
    expect(findTime("050 123 4567")).toBeUndefined();
    expect(customerQuery("cancel the booking for 4567")).toBe("4567");
  });

  it("reads an answer to 'whose appointment?' as a name unless it is a new request", () => {
    const pending = { then: "cancel" as const };
    expect(understandReply("Omar", ctx, pending)).toEqual({ t: "customer", query: "Omar", then: "cancel" });
    expect(understandReply("050 765 4321", ctx, pending)).toEqual({ t: "customer", query: "0507654321", then: "cancel" });
    expect(understandReply("Book a whitening appointment", ctx, pending)).toEqual({ t: "book", serviceId: "whitening" });
  });
});
