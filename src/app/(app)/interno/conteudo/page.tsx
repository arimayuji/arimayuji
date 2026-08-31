"use client";

import { useEffect, useState } from "react";
import {
  createContentIdea,
  deleteContentIdea,
  listContentIdeas,
  updateContentIdeaStatus,
  type ContentIdea,
  type ContentPillar,
  type ContentStatus,
} from "@/lib/contentIdeas";
import { INTERNAL_TEAM_ACCOUNT_IDS } from "@/lib/internalTeam";
import { useAuth } from "@/lib/useAuth";
import { useHeaderClose } from "../../app-shell";
import { Card, CardTitle, delay, NoticeBadge, PillTabs, Screen, ScreenHeader, SegmentedButton } from "../../ui";

const PILLAR_ORDER: ContentPillar[] = ["produto", "autentico", "autoridade", "marca", "comunidade"];
const PILLAR_LABEL: Record<ContentPillar, string> = {
  produto: "Produto",
  autentico: "Autêntico",
  autoridade: "Autoridade",
  marca: "Marca",
  comunidade: "Comunidade",
};

const STATUS_ORDER: ContentStatus[] = ["ideia", "rascunho", "agendado", "publicado"];
const STATUS_LABEL: Record<ContentStatus, string> = {
  ideia: "Ideia",
  rascunho: "Rascunho",
  agendado: "Agendado",
  publicado: "Publicado",
};
const STATUS_TABS = STATUS_ORDER.map((id) => ({ id, label: STATUS_LABEL[id] }));

/**
 * Internal-only board for tracking content ideas by pillar/status — never
 * a public app screen, never in the bottom nav (see app-shell.tsx's `TABS`,
 * untouched by this route). The real access boundary is the
 * `content_ideas` table's own Appwrite permissions (scripts/appwrite-setup.ts);
 * this page's own check against `INTERNAL_TEAM_ACCOUNT_IDS` is only a UI
 * courtesy, since a static export has no server to enforce anything before
 * the bundle loads.
 */
export default function ConteudoInternoPage() {
  useHeaderClose("/perfil");
  const { status, account } = useAuth();
  const authorized = status === "signed-in" && !!account && INTERNAL_TEAM_ACCOUNT_IDS.includes(account.id);

  const [ideas, setIdeas] = useState<ContentIdea[] | null>(null);
  const [activeStatus, setActiveStatus] = useState<ContentStatus>("ideia");

  const [title, setTitle] = useState("");
  const [pillar, setPillar] = useState<ContentPillar>("produto");
  const [notes, setNotes] = useState("");
  const [assetUrl, setAssetUrl] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!authorized) return;
    listContentIdeas().then(setIdeas);
  }, [authorized]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (creating || !title.trim()) return;
    setCreating(true);
    const created = await createContentIdea({
      title: title.trim(),
      pillar,
      notes: notes.trim() || undefined,
      assetUrl: assetUrl.trim() || undefined,
    });
    setCreating(false);
    if (!created) return;
    setIdeas((current) => [created, ...(current ?? [])]);
    setTitle("");
    setNotes("");
    setAssetUrl("");
  };

  const handleStatusChange = async (idea: ContentIdea, next: ContentStatus) => {
    setIdeas((current) => current?.map((row) => (row.$id === idea.$id ? { ...row, status: next } : row)) ?? current);
    const ok = await updateContentIdeaStatus(idea.$id, next);
    if (!ok) setIdeas((current) => current?.map((row) => (row.$id === idea.$id ? { ...row, status: idea.status } : row)) ?? current);
  };

  const handleDelete = async (idea: ContentIdea) => {
    setIdeas((current) => current?.filter((row) => row.$id !== idea.$id) ?? current);
    const ok = await deleteContentIdea(idea.$id);
    if (!ok) setIdeas((current) => (current ? [...current, idea] : current));
  };

  if (status === "loading") {
    return (
      <Screen>
        <Card className="pr-enter" style={delay(40)}>
          <p className="text-sm text-muted">Verificando sua conta…</p>
        </Card>
      </Screen>
    );
  }

  if (!authorized) {
    return (
      <Screen>
        <Card className="pr-enter" style={delay(40)}>
          <CardTitle>Essa área não é pública</CardTitle>
        </Card>
      </Screen>
    );
  }

  const visibleIdeas = (ideas ?? []).filter((idea) => idea.status === activeStatus);

  return (
    <>
      <ScreenHeader title="Conteúdo" />

      <Screen>
        <Card className="pr-enter" style={delay(0)}>
          <CardTitle>Nova ideia</CardTitle>
          <form onSubmit={handleCreate} className="flex flex-col gap-3.5">
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value.slice(0, 120))}
              placeholder="Título"
              className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent"
            />
            <div className="flex flex-wrap gap-1.5">
              {PILLAR_ORDER.map((p) => (
                <SegmentedButton key={p} selected={pillar === p} onClick={() => setPillar(p)}>
                  {PILLAR_LABEL[p]}
                </SegmentedButton>
              ))}
            </div>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value.slice(0, 2000))}
              placeholder="Notas (opcional)"
              rows={2}
              className="resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent"
            />
            <input
              type="url"
              value={assetUrl}
              onChange={(event) => setAssetUrl(event.target.value.slice(0, 500))}
              placeholder="Link do asset (opcional) — Artifact, Recraft, vídeo..."
              className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={creating || !title.trim()}
              className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground disabled:opacity-40"
            >
              {creating ? "Adicionando…" : "Adicionar"}
            </button>
          </form>
        </Card>

        <Card className="pr-enter" style={delay(20)}>
          <div className="mb-4">
            <PillTabs tabs={STATUS_TABS} active={activeStatus} onChange={setActiveStatus} />
          </div>

          {ideas === null ? (
            <div className="h-12 animate-pulse rounded-lg bg-background" />
          ) : visibleIdeas.length === 0 ? (
            <p className="py-2 text-center text-xs leading-relaxed text-muted">Nada em {STATUS_LABEL[activeStatus].toLowerCase()}.</p>
          ) : (
            <ul className="flex flex-col gap-3.5">
              {visibleIdeas.map((idea) => (
                <IdeaCard key={idea.$id} idea={idea} onStatusChange={handleStatusChange} onDelete={handleDelete} />
              ))}
            </ul>
          )}
        </Card>
      </Screen>
    </>
  );
}

function IdeaCard({
  idea,
  onStatusChange,
  onDelete,
}: {
  idea: ContentIdea;
  onStatusChange: (idea: ContentIdea, next: ContentStatus) => void;
  onDelete: (idea: ContentIdea) => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <li className="border-t border-border pt-3 first:border-t-0 first:pt-0">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold">{idea.title}</p>
        <NoticeBadge>{PILLAR_LABEL[idea.pillar]}</NoticeBadge>
      </div>
      {idea.notes && <p className="mt-1.5 text-xs leading-relaxed text-muted text-pretty">{idea.notes}</p>}
      {idea.assetUrl && (
        <a
          href={idea.assetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1.5 inline-block text-xs text-accent underline underline-offset-2"
        >
          Ver asset →
        </a>
      )}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {STATUS_ORDER.map((s) => (
          <SegmentedButton key={s} selected={idea.status === s} onClick={() => onStatusChange(idea, s)}>
            {STATUS_LABEL[s]}
          </SegmentedButton>
        ))}
      </div>
      <div className="mt-2 flex justify-end">
        {confirming ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onDelete(idea)}
              className="rounded-full bg-bad px-3 py-1 text-xs font-semibold text-white"
            >
              Confirmar
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted hover:text-foreground"
            >
              Voltar
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted hover:border-bad hover:text-bad"
          >
            Excluir
          </button>
        )}
      </div>
    </li>
  );
}
