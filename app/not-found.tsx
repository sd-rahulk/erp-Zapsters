import Link from "next/link";
export default function NotFound() {
  return <main className="route-loading"><div className="panel empty large"><h1>Page unavailable</h1><p>This address doesn’t match a workspace page.</p><Link href="/" className="button primary">Back to overview</Link></div></main>;
}
