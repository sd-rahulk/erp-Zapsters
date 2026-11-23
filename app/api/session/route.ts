import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertLocalOrigin, sessionCookie, signIn, signOut } from "@/lib/server/auth";
import { AppError } from "@/lib/server/db";
import { errorResponse } from "@/lib/server/http";

const credentials = z.object({email:z.email().max(150),password:z.string().min(1).max(128)});
export async function POST(request: NextRequest) {
  try {
    assertLocalOrigin(request);
    const input = credentials.safeParse(await request.json().catch(()=>null));
    if (!input.success) throw new AppError("Enter an email address and password.");
    const result = signIn(input.data.email.toLowerCase(),input.data.password,request.cookies.get(sessionCookie)?.value);
    const response = NextResponse.json({ok:true});
    response.cookies.set(sessionCookie,result.token,{httpOnly:true,sameSite:"strict",path:"/",secure:request.nextUrl.protocol==="https:",maxAge:result.lifetime});
    return response;
  } catch (error) { return errorResponse(error); }
}
export async function DELETE(request: NextRequest) {
  try {
    assertLocalOrigin(request);
    signOut(request.cookies.get(sessionCookie)?.value);
    const response = NextResponse.json({ok:true});
    response.cookies.delete(sessionCookie);
    return response;
  } catch (error) { return errorResponse(error); }
}
