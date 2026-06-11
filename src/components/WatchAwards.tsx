import { useMemo, useState } from "react";

import type { FilmAwardGroup, FilmAwardsPayload } from "../lib/kinopoisk";

const SUMMARY_CHIP_LIMIT = 3;

function formatPersons(persons: string[]): string | null {
  if (persons.length === 0) {
    return null;
  }

  if (persons.length <= 2) {
    return persons.join(", ");
  }

  return `${persons[0]} +${persons.length - 1}`;
}

function groupScore(group: FilmAwardGroup): string {
  const total = group.wins + group.nominations;
  if (group.wins > 0 && group.nominations === 0) {
    return String(group.wins);
  }

  return `${group.wins}/${total}`;
}

type WatchAwardChipsProps = {
  awards: FilmAwardsPayload;
  onReveal?: () => void;
};

export function WatchAwardChips({ awards, onReveal }: WatchAwardChipsProps) {
  const chips = awards.summary.slice(0, SUMMARY_CHIP_LIMIT);

  if (chips.length === 0) {
    return null;
  }

  return (
    <div className="watch-awards-chips" aria-label="Главные награды">
      {chips.map((chip) => (
        <button
          key={chip.name}
          type="button"
          className="watch-awards-chips__chip"
          onClick={onReveal}
        >
          {chip.imageUrl ? (
            <img
              className="watch-awards-chips__icon"
              src={chip.imageUrl}
              alt=""
              loading="lazy"
            />
          ) : (
            <span className="watch-awards-chips__icon watch-awards-chips__icon--fallback" aria-hidden="true">
              ★
            </span>
          )}
          <span>
            {chip.name}
            {chip.wins > 0 ? ` ×${chip.wins}` : null}
          </span>
        </button>
      ))}
    </div>
  );
}

type WatchAwardsPanelProps = {
  awards: FilmAwardsPayload;
  panelId?: string;
};

export function WatchAwardsPanel({ awards, panelId = "watch-awards-panel" }: WatchAwardsPanelProps) {
  const defaultOpenKey = awards.groups[0] ? `${awards.groups[0].name}:${awards.groups[0].year}` : null;
  const [openGroupKey, setOpenGroupKey] = useState<string | null>(defaultOpenKey);
  const highlights = awards.summary.slice(0, SUMMARY_CHIP_LIMIT);

  const toggleGroup = (groupKey: string) => {
    setOpenGroupKey((current) => (current === groupKey ? null : groupKey));
  };

  if (awards.total === 0 || awards.groups.length === 0) {
    return null;
  }

  return (
    <section className="watch-awards" id={panelId} aria-label="Награды">
      <div className="watch-awards__head">
        <div>
          <p className="watch-awards__eyebrow">Награды</p>
          <h2 className="watch-awards__title">Признание и номинации</h2>
        </div>
        <span className="watch-awards__count">{awards.total}</span>
      </div>

      {highlights.length > 0 ? (
        <div className="watch-awards__highlights" role="list">
          {highlights.map((chip) => (
            <article key={chip.name} className="watch-awards__highlight" role="listitem">
              {chip.imageUrl ? (
                <img
                  className="watch-awards__highlight-image"
                  src={chip.imageUrl}
                  alt=""
                  loading="lazy"
                />
              ) : (
                <span className="watch-awards__highlight-image watch-awards__highlight-image--fallback" aria-hidden="true">
                  ★
                </span>
              )}
              <strong>{chip.name}</strong>
              <span>{chip.wins > 0 ? `${chip.wins} побед` : "Номинации"}</span>
              {chip.nominations > 0 ? (
                <small>
                  {chip.wins}/{chip.wins + chip.nominations}
                </small>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}

      <div className="watch-awards__groups">
        {awards.groups.map((group) => {
          const groupKey = `${group.name}:${group.year}`;
          const isOpen = openGroupKey === groupKey;

          return (
            <article key={groupKey} className="watch-awards__group">
              <button
                type="button"
                className="watch-awards__group-toggle"
                aria-expanded={isOpen}
                onClick={() => toggleGroup(groupKey)}
              >
                <span className="watch-awards__group-title">
                  {group.imageUrl ? (
                    <img className="watch-awards__group-icon" src={group.imageUrl} alt="" loading="lazy" />
                  ) : null}
                  <span>
                    <strong>
                      {group.name} {group.year}
                    </strong>
                    <small>
                      {group.wins} побед · {group.nominations} номинаций
                    </small>
                  </span>
                </span>
                <span className="watch-awards__group-score">{groupScore(group)}</span>
              </button>

              {isOpen ? (
                <ul className="watch-awards__items">
                  {group.items.map((item) => {
                    const persons = formatPersons(item.persons);
                    return (
                      <li
                        key={`${item.nominationName}:${item.win ? "win" : "nom"}`}
                        className={`watch-awards__item${item.win ? " watch-awards__item--win" : " watch-awards__item--nomination"}`}
                      >
                        <span className="watch-awards__item-marker" aria-hidden="true">
                          {item.win ? "●" : "○"}
                        </span>
                        <span className="watch-awards__item-copy">
                          <strong>{item.nominationName}</strong>
                          {persons ? <small>{persons}</small> : null}
                        </span>
                        <span className="watch-awards__item-status">{item.win ? "Победа" : "Номинация"}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function WatchAwardsChipsSkeleton() {
  return (
    <div className="watch-awards-chips watch-awards-chips--skeleton" aria-hidden="true">
      {Array.from({ length: 3 }).map((_, index) => (
        <span key={index} className="watch-awards-chips__chip watch-awards-chips__chip--skeleton" />
      ))}
    </div>
  );
}

export function WatchAwardsPanelSkeleton() {
  return (
    <section className="watch-awards watch-awards--skeleton" aria-label="Загрузка наград">
      <span className="watch-awards__skeleton-head" />
      <div className="watch-awards__highlights">
        {Array.from({ length: 3 }).map((_, index) => (
          <span key={index} className="watch-awards__highlight watch-awards__highlight--skeleton" />
        ))}
      </div>
      <div className="watch-awards__groups">
        {Array.from({ length: 2 }).map((_, index) => (
          <span key={index} className="watch-awards__group-skeleton" />
        ))}
      </div>
    </section>
  );
}

export function useWatchAwardsReveal(panelId = "watch-awards-panel") {
  return useMemo(
    () => () => {
      document.getElementById(panelId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [panelId]
  );
}
