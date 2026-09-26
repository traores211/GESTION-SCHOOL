"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Shell from "../../components/Shell";
import ViewRenderer, { ViewComponent } from "../../components/ViewRenderer";
import { api, errorMessage } from "../../lib/api";
import { EmptyState, ErrorAlert, SkeletonRows } from "../../components/ui/States";

interface Saved {
  id: string;
  name: string;
}

export default function ViewsPage() {
  const [views, setViews] = useState<Saved[]>([]);
  const [current, setCurrent] = useState<{ id: string; title: string; components: ViewComponent[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const open = async (id: string) => {
    setError(null);
    try {
      setCurrent(await api.get(`/ai/views/${id}/data`));
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  useEffect(() => {
    api
      .get<Saved[]>("/ai/views")
      .then((v) => {
        setViews(v);
        if (v[0]) open(v[0].id);
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  const remove = async (id: string) => {
    await api.delete(`/ai/views/${id}`);
    setViews((v) => v.filter((x) => x.id !== id));
    if (current?.id === id) setCurrent(null);
  };

  return (
    <Shell title="Mes tableaux de bord">
      <div className="page-header">
        <div>
          <h1>Mes tableaux de bord</h1>
          <p>Tableaux créés avec l&apos;assistant. Les données sont relues à chaque ouverture, selon vos droits actuels.</p>
        </div>
      </div>
      <ErrorAlert message={error} />
      {loading ? (
        <SkeletonRows />
      ) : views.length === 0 ? (
        <EmptyState title="Aucun tableau de bord" text="Demandez à l'assistant : « Crée-moi un tableau de bord pour suivre les impayés »." action={<Link className="btn btn-primary" href="/assistant">Ouvrir l&apos;assistant</Link>} />
      ) : (
        <>
          <div className="tabs" role="tablist">
            {views.map((v) => (
              <button key={v.id} type="button" role="tab" className="tab" aria-selected={current?.id === v.id} onClick={() => open(v.id)}>
                {v.name}
              </button>
            ))}
          </div>
          {current && (
            <>
              <ViewRenderer components={current.components} />
              <div className="form-actions">
                <button type="button" className="btn btn-outline btn-sm" onClick={() => remove(current.id)}>
                  Supprimer ce tableau
                </button>
              </div>
            </>
          )}
        </>
      )}
    </Shell>
  );
}
