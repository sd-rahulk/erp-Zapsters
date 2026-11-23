import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/manrope";
import "./globals.css";

export const metadata: Metadata = {
  title: {default:"Zapsters ERP",template:"%s | Zapsters ERP"},
  description:"A shared workspace for people, purchasing, inventory, and finance.",
};
export default function RootLayout({children}: Readonly<{children:React.ReactNode}>) {
  return <html lang="en"><body>{children}</body></html>;
}
