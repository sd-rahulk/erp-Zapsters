"use client";
import Link from "next/link";

export default function WorkspaceError({reset}: {reset:()=>void}) {
  return <main className="route-loading">
    <section className="panel empty large" role="alert">
      <h1>Workspace could not load</h1>
      <p>Try again or return to the overview.</p>
      <div className="detail-actions">
        <button type="button" className="button primary" onClick={reset}>Try again</button>
        <Link className="button secondary" href="/">Overview</Link>
      </div>
    </section>
  </main>;
}
