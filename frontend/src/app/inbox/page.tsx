"use client";

import { useCallback, useEffect, useState } from "react";
import { Inbox, Lock } from "lucide-react";
import Shell from "../../components/Shell";
import Thread, { ThreadMessage } from "../../components/Thread";
import { EmptyState, Modal, PageHeader, Pagination, TableSkeleton, useFeedback } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";

interface Row {
  id: string;
  subject: string;
  status: "OPEN" | "CLOSED";
  unreadBySchool: boolean;
  lastMessageAt: string;
  parent: { firstName: string; lastName: string; phone: string };
  student: { id: string; firstName: string; lastName: string } | null;
}

interface Detail extends Row {
  messages: ThreadMessage[];
}

function InboxContent() {
  const feedback = useFeedback();
  const [data, setData] = useState<{ items: Row[]; total: number; page: number; pageSize: number; pageCount: number; unread: number } | null>(null);
  const [status, setStatus] = useState("OPEN");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<Detail | null>(null);

  const load = useCallback(() => {
    const query = new URLSearchParams({ page: String(page) });
    if (status) query.set("status", status);
    if (q) query.set("q", q);
    api
      .get<NonNullable<typeof data>>(`/conversations?${query}`)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [page, status, q]);
  useEffect(load, [load]);

  const openThread = (id: string) =>
    api
      .get<Detail>(`/conversations/${id}`)
      .then((d) => {
        setCurrent(d);
        load();
      })
      .catch((err) => feedback.error("Conversation indisponible", errorMessage(err)));

  const close = async () => {
    if (!current) return;
    try {
      setCurrent(await api.patch<Detail>(`/conversations/${current.id}/close`));
      feedback.success("Conversation close");
      load();
    } catch (err) {
      feedback.error("Action impossible", errorMessage(err));
    }
  };

  return (
    <>
      <PageHeader title="Messages des parents" description={data ? `${data.unread} conversation(s) en attente de réponse.` : "Les questions envoyées par les familles depuis leur espace."} />

      <div className="table-toolbar audit-filters">
        <select className="input" aria-label="État" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="OPEN">Conversations ouvertes</option>
          <option value="CLOSED">Conversations closes</option>
          <option value="">Toutes</option>
        </select>
        <input className="input" placeholder="Rechercher (objet, parent, élève…)" aria-label="Rechercher une conversation" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      </div>

      <div className="table-wrap">
        {error ? (
          <EmptyState tone="error" title="Messages indisponibles">
            {error}
          </EmptyState>
        ) : !data ? (
          <TableSkeleton columns={4} rows={5} />
        ) : data.items.length === 0 ? (
          <EmptyState icon={<Inbox size={22} />} title="Aucune conversation">
            Les parents écrivent à l&apos;établissement depuis l&apos;onglet « Messages » de leur espace.
          </EmptyState>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th>Objet</th>
                  <th>Parent</th>
                  <th>Élève</th>
                  <th>Dernier message</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <button type="button" className="link-button cell-main" onClick={() => openThread(c.id)}>
                        {c.subject}
                      </button>
                      {c.unreadBySchool && <span className="badge badge-warning" style={{ marginLeft: 8 }}>À lire</span>}
                      {c.status === "CLOSED" && <span className="badge badge-neutral" style={{ marginLeft: 8 }}>Close</span>}
                    </td>
                    <td>
                      {c.parent.lastName} {c.parent.firstName}
                      <div className="cell-sub">{c.parent.phone}</div>
                    </td>
                    <td>{c.student ? `${c.student.lastName} ${c.student.firstName}` : <span className="muted">—</span>}</td>
                    <td className="nowrap">{new Date(c.lastMessageAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} onPage={setPage} unit="conversation" />
          </>
        )}
      </div>

      <Modal
        open={!!current}
        onClose={() => setCurrent(null)}
        size="lg"
        title={current?.subject ?? ""}
        description={current ? `${current.parent.firstName} ${current.parent.lastName}${current.student ? ` · au sujet de ${current.student.firstName} ${current.student.lastName}` : ""}` : undefined}
        footer={
          current && (
            <>
              {current.status === "OPEN" && (
                <button type="button" className="btn btn-outline" onClick={close}>
                  <Lock size={16} /> Clore la conversation
                </button>
              )}
              <span className="spacer" />
              <button type="button" className="btn btn-outline" onClick={() => setCurrent(null)}>
                Fermer
              </button>
            </>
          )
        }
      >
        {current && (
          <Thread
            messages={current.messages}
            mine="school"
            closed={false}
            onSend={async (body) => {
              try {
                setCurrent(await api.post<Detail>(`/conversations/${current.id}/messages`, { body }));
                load();
              } catch (err) {
                feedback.error("Envoi impossible", errorMessage(err));
                throw err;
              }
            }}
          />
        )}
      </Modal>
    </>
  );
}

export default function InboxPage() {
  return (
    <Shell title="Messages des parents">
      <InboxContent />
    </Shell>
  );
}
