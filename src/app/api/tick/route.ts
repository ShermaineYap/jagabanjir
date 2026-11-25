import { runTick } from "@/lib/tick";
import { originOf } from "@/lib/server";

export const maxDuration = 60;

/** Public and idempotent: runs at most once per 10 minutes, whoever calls it. */
async function handle(req: Request) {
  try {
    const r = await runTick(new Date(), originOf(req));
    return Response.json(r);
  } catch (e) {
    return Response.json({ ran: false, error: String(e) }, { status: 502 });
  }
}

export const GET = handle;
export const POST = handle;
