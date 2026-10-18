import { useState } from "react";

import type { FilmListResponse, FilmSummary } from "../../../contracts/api";
import { Section } from "../../components/Form";
import { filmDeletionErrorMessage } from "../../model";
import { DeliveryViewer } from "./DeliveryViewer";

type FilmState = "delivered" | "in-progress" | "error";

const stateOf = (film: FilmSummary): FilmState =>
  film.title === null ? "error" : film.delivered === null ? "in-progress" : "delivered";

const stateLabels: Record<FilmState, string> = {
  delivered: "已交付",
  "in-progress": "制作中",
  error: "film.json 无效",
};

// Reuses the status dot colours of the stylesheet.
const stateClass: Record<FilmState, string> = {
  delivered: "current",
  "in-progress": "needs-agent",
  error: "error",
};

const musicLabels = { none: "无配乐", ready: "配乐已生成", missing: "配乐待生成" };

export const FilmsPanel = ({
  list,
  status,
  error,
  refresh,
  deleteFilm,
}: {
  readonly list: FilmListResponse | null;
  readonly status: string;
  readonly error: string | null;
  readonly refresh: () => Promise<void>;
  readonly deleteFilm: (filmId: string, confirmation: string) => Promise<void>;
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const films = list?.films ?? [];
  const selected =
    films.find(({ filmId }) => filmId === selectedId) ?? films[0] ?? null;
  const confirmDelete = async () => {
    if (selected === null) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteFilm(selected.filmId, confirmation);
      setPendingDelete(false);
      setConfirmation("");
    } catch (caught) {
      setDeleteError(filmDeletionErrorMessage(caught));
    } finally {
      setDeleting(false);
    }
  };
  return (
    <Section
      eyebrow="FILMS"
      title="作品与交付"
      description="列出 src/films 下的作品与当前交付；制作由 Agent 按 axmorf-film Skill 完成。"
    >
      <div className="progress-toolbar">
        <div>
          <span>DIRECT FILMS</span>
          <strong>{error ?? status}</strong>
          <small>{films.length} 部作品</small>
        </div>
        <button
          className="secondary-button"
          disabled={deleting}
          onClick={() => void refresh()}
        >
          刷新
        </button>
      </div>
      {films.length === 0 ? (
        <div className="progress-empty">
          <strong>
            {error === null ? "还没有作品" : "作品列表暂不可用"}
          </strong>
        </div>
      ) : (
        <div className="project-progress-layout">
          <nav className="project-list" aria-label="作品列表">
            {films.map((film) => (
              <button
                className={selected?.filmId === film.filmId ? "active" : ""}
                key={film.filmId}
                onClick={() => {
                  setSelectedId(film.filmId);
                  setPendingDelete(false);
                  setConfirmation("");
                  setDeleteError(null);
                }}
              >
                <i className={stateClass[stateOf(film)]} />
                <span>
                  <strong>{film.title ?? film.filmId}</strong>
                  <small>{stateLabels[stateOf(film)]}</small>
                </span>
              </button>
            ))}
          </nav>
          {selected === null ? null : (
            <article className="project-progress-card">
              <div className="project-progress-heading">
                <div>
                  <span>FILM</span>
                  <h3>{selected.title ?? selected.filmId}</h3>
                  <code>{selected.filmId}</code>
                </div>
                <button
                  className="danger-button"
                  onClick={() => setPendingDelete(true)}
                >
                  删除作品
                </button>
              </div>
              {pendingDelete ? (
                <div className="project-delete-confirmation" role="alert">
                  <strong>这会删除该作品的源码、素材、交付与历史交付。</strong>
                  <p>
                    输入 <code>{selected.filmId}</code> 确认；其他作品、私有配置和
                    voice profile 不受影响。
                  </p>
                  <input
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    aria-label={`输入 ${selected.filmId} 确认删除`}
                  />
                  {deleteError === null ? null : (
                    <p className="delete-error">{deleteError}</p>
                  )}
                  <div>
                    <button
                      className="secondary-button"
                      onClick={() => setPendingDelete(false)}
                    >
                      取消
                    </button>
                    <button
                      className="danger-button solid"
                      disabled={deleting || confirmation !== selected.filmId}
                      onClick={() => void confirmDelete()}
                    >
                      {deleting ? "删除中…" : "永久删除"}
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="progress-summary">
                <div>
                  <span>规格</span>
                  <strong>
                    {selected.render === null
                      ? "—"
                      : `${selected.render.width}×${selected.render.height} · ${selected.render.fps}fps`}
                  </strong>
                </div>
                <div>
                  <span>旁白</span>
                  <strong>
                    {selected.sentences ?? 0} 句 · {selected.voice ? "已生成" : "待生成"}
                  </strong>
                </div>
                <div>
                  <span>配乐</span>
                  <strong>{musicLabels[selected.music]}</strong>
                </div>
                <div>
                  <span>时长</span>
                  <strong>
                    {selected.delivered === null
                      ? "未交付"
                      : `${selected.delivered.seconds}s`}
                  </strong>
                </div>
              </div>
              {selected.delivered === null ? (
                <div className="progress-footnote">
                  <strong>尚未交付</strong>
                  <p>
                    <code>npm run film:deliver -- --film {selected.filmId}</code>
                  </p>
                </div>
              ) : (
                <DeliveryViewer
                  filmId={selected.filmId}
                  deliveredAt={selected.delivered.at}
                />
              )}
            </article>
          )}
        </div>
      )}
    </Section>
  );
};
