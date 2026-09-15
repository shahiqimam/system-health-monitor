'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { EmptyRow, ErrorNote, IncidentBadge } from '@/components/ui';
import { api, queryString } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { Incident, IncidentStatus, Paginated } from '@/lib/types';

const STATUSES: (IncidentStatus | '')[] = ['', 'OPEN', 'ACKNOWLEDGED', 'RESOLVED'];

export default function IncidentsPage() {
  const [status, setStatus] = useState<IncidentStatus | ''>('');
  const [page, setPage] = useState(1);

  const incidents = useQuery({
    queryKey: ['incidents', status, page],
    queryFn: () =>
      api.get<Paginated<Incident>>(
        `/incidents${queryString({ status: status || undefined, page, limit: 25 })}`,
      ),
    refetchInterval: 20_000,
  });

  return (
    <AppShell>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Incidents</h1>
        <select
          className="input max-w-[12rem]"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as IncidentStatus | '');
            setPage(1);
          }}
        >
          {STATUSES.map((option) => (
            <option key={option || 'all'} value={option}>
              {option || 'All statuses'}
            </option>
          ))}
        </select>
      </div>

      <ErrorNote error={incidents.error} />

      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Target</th>
              <th>Status</th>
              <th>Started</th>
              <th>Acknowledged</th>
              <th>Resolved</th>
              <th>Summary</th>
            </tr>
          </thead>
          <tbody>
            {(incidents.data?.items ?? []).map((incident) => (
              <tr key={incident.id}>
                <td>
                  <Link className="font-medium hover:underline" href={`/incidents/${incident.id}`}>
                    {incident.target?.name ?? 'Target'}
                  </Link>
                </td>
                <td>
                  <IncidentBadge status={incident.status} />
                </td>
                <td className="whitespace-nowrap">{formatDateTime(incident.startedAt)}</td>
                <td className="whitespace-nowrap">{formatDateTime(incident.acknowledgedAt)}</td>
                <td className="whitespace-nowrap">{formatDateTime(incident.resolvedAt)}</td>
                <td className="text-slate-600">{incident.summary}</td>
              </tr>
            ))}
            {incidents.data && incidents.data.items.length === 0 ? (
              <EmptyRow colSpan={6} label="No incidents recorded" />
            ) : null}
          </tbody>
        </table>
      </div>

      {incidents.data && incidents.data.pages > 1 ? (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span className="text-slate-500">
            Page {incidents.data.page} of {incidents.data.pages} · {incidents.data.total} incidents
          </span>
          <button
            className="btn"
            disabled={page >= incidents.data.pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      ) : null}
    </AppShell>
  );
}
