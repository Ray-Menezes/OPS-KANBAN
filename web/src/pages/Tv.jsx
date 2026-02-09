import React from "react";
import { api, connectStream } from "../api.js";
import { fmtDateKey, msToHMS, leadMs, workMs, fmtBRDateTime } from "../util.js";

const COLS = [
  { key: "A_FAZER", label: "A Fazer", cls: "c1" },
  { key: "EM_ANDAMENTO", label: "Em andamento", cls: "c2" },
  { key: "BLOQUEADO", label: "Bloqueado", cls: "c3" },
  { key: "CONCLUIDO", label: "Concluído", cls: "c4" }
];

export default function Tv() {
  const [dateKey, setDateKey] = React.useState(() => fmtDateKey(new Date()));
  const [cards, setCards] = React.useState([]);
  const [now, setNow] = React.useState(() => Date.now());

  async function load() {
    const res = await api.getBoard(dateKey);
    setCards(res.cards || []);
  }

  React.useEffect(() => { load().catch(()=>{}); }, [dateKey]);
  React.useEffect(() => {
    const stop = connectStream(() => load().catch(()=>{}));
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey]);

  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="container">
      <div className="topbar">
        <div className="brand">
          <img src="/fracht-logo.svg" alt="Fracht Log" />
          <div className="subtitle">Operação — {dateKey}</div>
        </div>

        <div className="actions">
          <input className="input" type="date" value={dateKey} onChange={(e)=>setDateKey(e.target.value)} />
          <a className="btn" href="/">Voltar</a>
        </div>
      </div>

      <div className="board">
        {COLS.map(col => {
          const colCards = cards.filter(c => c.status === col.key);
          return (
            <div key={col.key} className={`col ${col.cls}`}>
              <div className="col-header">
                <div>{col.label}</div>
                <div className="count">{colCards.length}</div>
              </div>

              <div className="cards">
                {colCards.slice(0, 12).map(c => (
                  <div key={c.id} className="card" style={{cursor:"default"}}>
                    <div className="card-title">{c.title}</div>
                    <div className="meta">
                      <span className="pill">👤 {(c.assignee || "").trim() ? c.assignee : "—"}</span>
                      <span className="pill">🟢 {c.started_at ? fmtBRDateTime(Number(c.started_at)) : "—"}</span>
                      <span className="pill">⏱ Lead {msToHMS(leadMs(c, now))}</span>
                      <span className="pill">🛠 Work {msToHMS(workMs(c, now))}</span>
                      <span className="pill">↩ {c.returns_to_afazer || 0}</span>
                    </div>
                  </div>
                ))}
                {colCards.length > 12 ? (
                  <div className="small" style={{padding:"0 8px"}}>+ {colCards.length - 12} itens...</div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
