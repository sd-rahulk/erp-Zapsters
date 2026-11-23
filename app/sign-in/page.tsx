import { redirect } from "next/navigation";
import { demoEnabled } from "@/db/sqlite.mjs";
import { actorForSession } from "@/lib/server/auth";
import { SignIn } from "@/components/sign-in";
import { demoPassword } from "@/db/seed.mjs";

export const metadata = {title:"Sign in"};
export default async function SignInPage() {
  if (await actorForSession()) redirect("/");
  return <SignIn enabled={demoEnabled()} demoHint={demoEnabled()?demoPassword:undefined}/>;
}
