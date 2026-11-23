import { assertLocalOrigin, requireActor } from "@/lib/server/auth";
import { executeCommand } from "@/lib/server/commands";
import { commandSchema } from "@/lib/server/validation";
import { AppError } from "@/lib/server/db";
import { errorResponse } from "@/lib/server/http";

export async function POST(request: Request) {
  try {
    assertLocalOrigin(request);
    if (Number(request.headers.get("content-length"))>24000) throw new AppError("The request is too large.",413);
    const text = await request.text();
    if (text.length>24000) throw new AppError("The request is too large.",413);
    const actor = await requireActor();
    const parsed = commandSchema.safeParse(JSON.parse(text));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new AppError("Check "+(issue.path.join(" · ")||"the form")+": "+issue.message);
    }
    return Response.json({id:executeCommand(actor,parsed.data)});
  } catch (error) { return errorResponse(error); }
}
