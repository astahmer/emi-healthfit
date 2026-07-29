import { useEffect, useState } from "react";
import { parseReleaseHistory, type ReleaseHistory } from "./release-history";

const releasedAt = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

export const Releases = () => {
  const [history, setHistory] = useState<ReleaseHistory | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/release-history.json", { cache: "no-store", signal: controller.signal })
      .then(async (response) => (response.ok ? parseReleaseHistory(await response.json()) : null))
      .then((releaseHistory) => {
        if (releaseHistory === null) setFailed(true);
        setHistory(releaseHistory);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, []);

  return (
    <main className="mx-auto h-full max-w-2xl overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-6">
      <h2 className="text-xl font-semibold">Release history</h2>
      <p className="text-muted-foreground mt-1 text-sm">
        Each release records its deployment time and source Jujutsu revision.
      </p>
      {history === null && !failed && (
        <p className="text-muted-foreground mt-6 text-sm">Loading releases…</p>
      )}
      {failed && <p className="text-destructive mt-6 text-sm">Could not load release history.</p>}
      {history?.releases.length === 0 && (
        <p className="text-muted-foreground mt-6 text-sm">No production releases recorded yet.</p>
      )}
      <div className="mt-6 space-y-4">
        {history?.releases.map((release) => (
          <article key={release.commitId} className="rounded-md border border-input p-4">
            <h3 className="font-medium">v{release.version}</h3>
            <dl className="text-muted-foreground mt-3 grid gap-2 text-sm sm:grid-cols-[9rem_1fr]">
              <dt>Deployed</dt>
              <dd>{releasedAt(release.releasedAt)}</dd>
              <dt>JJ commit</dt>
              <dd className="font-mono text-xs break-all">{release.commitId}</dd>
              <dt>JJ change</dt>
              <dd className="font-mono text-xs break-all">{release.changeId}</dd>
            </dl>
            {release.changes.length > 0 && (
              <ul className="mt-4 list-disc space-y-1 pl-5 text-sm">
                {release.changes.map((change) => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </div>
    </main>
  );
};
