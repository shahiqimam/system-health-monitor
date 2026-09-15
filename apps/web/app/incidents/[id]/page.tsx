'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { EmptyRow, ErrorNote, IncidentBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime, formatMs } from '@/lib/format';
import type { IncidentDetail } from '@/lib/types';

export default function IncidentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [note, setNote] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const incident = useQuery({
    queryKey: ['incident', id],
    queryFn: () => api.get<IncidentDetail>(`/incidents/${id}`),
    refetchInterval: 20_000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['incident', id] });

  const acknowledge = useMutation({
    mutationFn: () => api.post(`/incidents/${id}/acknowledge`),
    onSuccess: () => {
      setActionError(null);
      refresh();
    },
    onError: (error: unknown) =>
      setActionError(error instanceof Error ? error.message : 'Could not acknowledge'),
  });

  const addNote = useMutation({
    mutationFn: () => api.post(`/incidents/${id}/notes`, { content: note }),
    onSuccess: () => {
      setNote('');
      setActionError(null);
      refresh();
    },
    onError: (error: unknown) =>
      setActionError(error instanceof Error ? error.message : 'Could not add note'),
  });

  if (incident.isLoading) {
    return (
      <AppShell>
        <p className="text-sm text-slate-500">Loading incident…</p>
      </AppShell>
    );
  }
  if (incident.error || !incident.data) {
    return (
      <AppShell>
        <ErrorNote error={incident.error ?? new Error('Incident not found')} />
      </AppShell>
    );
  }

  const data = incident.data;

  return (
    <AppShell>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Incident</h1>
        <IncidentBadge status={data.status} />
        {can('ADMIN', 'OPERATOR') && data.status === 'OPEN' ? (
          <button
            className="btn btn-primary ml-auto"
            disabled={acknowledge.isPending}
            onClick={() => acknowledge.mutate()}
          >
            Acknowledge
          </button>
        ) : null}
      </div>

      {actionError ? <ErrorNote error={new Error(actionError)} /> : null}

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="card">
          <h2 className="mb-2 text-sm font-semibold">Details</h2>
          <dl className="space-y-1 text-sm">
            <Row
              label="Target"
              value={
                <Link className="hover:underline" href={`/targets/${data.targetId}`}>
                  {data.target?.name ?? data.targetId}
                </Link>
              }
            />
            <Row label="Started" value={formatDateTime(data.startedAt)} />
            <Row label="Acknowledged" value={formatDateTime(data.acknowledgedAt)} />
            <Row label="Acknowledged by" value={data.acknowledgedBy?.name ?? '-'} />
            <Row label="Resolved" value={formatDateTime(data.resolvedAt)} />
            <Row label="Failures at open" value={String(data.failureCountAtOpen)} />
          </dl>
          <p className="mt-3 rounded-md bg-slate-100 px-3 py-2 text-sm">{data.summary}</p>
          <p className="mt-2 text-xs text-slate-500">
            PulseWatch records availability symptoms only. Root cause is not inferred.
          </p>
        </div>

        <div className="card lg:col-span-2">
          <h2 className="mb-2 text-sm font-semibold">Notes</h2>
          <ul className="space-y-2 text-sm">
            {data.notes.map((entry) => (
              <li key={entry.id} className="rounded-md border border-slate-200 px-3 py-2">
                <p className="whitespace-pre-wrap">{entry.content}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {entry.authorName} · {formatDateTime(entry.createdAt)}
                </p>
              </li>
            ))}
            {data.notes.length === 0 ? <li className="text-slate-500">No notes yet.</li> : null}
          </ul>

          {can('ADMIN', 'OPERATOR') ? (
            <div className="mt-3 space-y-2">
              <textarea
                className="input"
                rows={3}
                maxLength={2000}
                placeholder="Add an operational note…"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
              <button
                className="btn btn-primary"
                disabled={addNote.isPending || note.trim().length === 0}
                onClick={() => addNote.mutate()}
              >
                Add note
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <section className="mt-4 card overflow-x-auto">
        <h2 className="mb-2 text-sm font-semibold">Checks around this incident</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Checked</th>
              <th>Result</th>
              <th>HTTP</th>
              <th>Latency</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {data.timeline.map((check) => (
              <tr key={check.id}>
                <td className="whitespace-nowrap">{formatDateTime(check.checkedAt)}</td>
                <td
                  className={
                    check.status === 'SUCCESS'
                      ? 'font-medium text-green-700'
                      : 'font-medium text-red-700'
                  }
                >
                  {check.status}
                </td>
                <td>{check.httpStatus ?? '-'}</td>
                <td>{formatMs(check.latencyMs)}</td>
                <td className="text-slate-500">{check.errorMessage ?? check.errorType ?? '-'}</td>
              </tr>
            ))}
            {data.timeline.length === 0 ? <EmptyRow colSpan={5} label="No checks recorded" /> : null}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-40 shrink-0 text-slate-500">{label}</dt>
      <dd className="break-all">{value}</dd>
    </div>
  );
}
