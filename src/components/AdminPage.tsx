import { useEffect, useState } from "react";

import { siteApi, type SignupRequestEntry } from "../lib/siteApi";
import { BackButton } from "./BackButton";

type AdminTab = "pending" | "decided";

type AdminPageProps = {
  isAdmin: boolean;
  onBack: () => void;
};

const TAB_LABELS: Record<AdminTab, string> = {
  pending: "Ожидают",
  decided: "Обработанные"
};

const STATUS_LABELS: Record<SignupRequestEntry["status"], string> = {
  pending: "Ожидает",
  approved: "Одобрена",
  rejected: "Отклонена"
};

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }) : "";
}

export function AdminPage({ isAdmin, onBack }: AdminPageProps) {
  const [tab, setTab] = useState<AdminTab>("pending");
  const [requests, setRequests] = useState<SignupRequestEntry[]>([]);
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    let cancelled = false;
    setRequests([]);
    setStatus("loading");
    setError(null);
    siteApi.getSignupRequests(tab).then(
      (items) => {
        if (!cancelled) {
          setRequests(items);
          setStatus("success");
        }
      },
      (loadError: unknown) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить заявки");
          setStatus("error");
        }
      }
    );

    return () => {
      cancelled = true;
    };
  }, [isAdmin, tab]);

  async function decide(id: number, decision: "approve" | "reject") {
    setBusyId(id);
    setError(null);
    try {
      await siteApi.decideSignupRequest(id, decision);
      setRequests((current) => current.filter((entry) => entry.id !== id));
    } catch (decideError) {
      setError(decideError instanceof Error ? decideError.message : "Не удалось обработать заявку");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="admin-page" id="main">
      <BackButton label="В кабинет" onClick={onBack} />
      <div className="section-heading">
        <h1>Заявки на регистрацию</h1>
      </div>

      {!isAdmin ? (
        <div className="empty-state">
          <strong>Нет доступа</strong>
        </div>
      ) : (
        <>
          <div className="admin-page__tabs" role="tablist">
            {(Object.keys(TAB_LABELS) as AdminTab[]).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                className="admin-page__tab"
                onClick={() => setTab(key)}
              >
                {TAB_LABELS[key]}
              </button>
            ))}
          </div>

          {error ? (
            <p className="error-message" role="alert">
              {error}
            </p>
          ) : null}

          {status === "loading" ? <p className="admin-page__hint">Загружаем…</p> : null}

          {status === "success" && requests.length === 0 ? (
            <div className="empty-state">
              <strong>{tab === "pending" ? "Новых заявок нет." : "Обработанных заявок пока нет."}</strong>
            </div>
          ) : null}

          {requests.length > 0 ? (
            <ul className="admin-page__list">
              {requests.map((request) => (
                <li key={request.id} className="admin-page__row">
                  <div className="admin-page__info">
                    <strong>{request.email}</strong>
                    <span>
                      {tab === "pending"
                        ? formatDate(request.createdAt)
                        : `${STATUS_LABELS[request.status]} · ${formatDate(request.decidedAt)}`}
                    </span>
                  </div>
                  {tab === "pending" ? (
                    <div className="admin-page__actions">
                      <button
                        type="button"
                        className="admin-page__approve"
                        disabled={busyId === request.id}
                        onClick={() => void decide(request.id, "approve")}
                      >
                        Одобрить
                      </button>
                      <button
                        type="button"
                        className="admin-page__reject"
                        disabled={busyId === request.id}
                        onClick={() => void decide(request.id, "reject")}
                      >
                        Отклонить
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </section>
  );
}
