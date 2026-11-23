import { AppError } from "./db";
export function errorResponse(error: unknown) {
  if (error instanceof AppError) return Response.json({error:error.message},{status:error.status});
  if (error instanceof SyntaxError) return Response.json({error:"The request body is invalid."},{status:400});
  console.error(error);
  return Response.json({error:"The operation could not be completed. Try again."},{status:500});
}
