import React from "react";
import { api, connectStream } from "../api.js";
import { fmtDateKey, safeTags } from "../util.js";
import Card from "../Card.jsx";
import { useAuth } from "../auth.jsx";

const COLS = [
  { key: "A_FAZER", label: "A Fazer", cls: "c1" },
  { key: "EM_ANDAMENTO", label: "Em andamento", cls: "c2" },
  { key: "BLOQUEADO", label: "Bloqueado", cls: "c3" },
  { key: "CONCLUIDO", label: "Concluído", cls: "c4" }
];

const PRIORIDADES = ["NORMAL", "ALTA"];
const TAGS = ["Cross Docking", "Carregamento", "Descarregamento", "Cliente X"];

export default function Board() {
  const { logout, user } = useAuth();

  const [dateKey, setDateKey] = React.useState(() => fmtDateKey(new Date()));
  const [cards, setCards] = React.useState([]);
  const [loading, setLoading] = React.useState(false);

  // filtros
  const [q, setQ] = React.useState("");
  const [prioFilter, setPrioFilter] = React.useState("TODAS");
  const [assigneeFilter, setAssigneeFilter] = React.useState("TODOS");
  const [tagFilter, setTagFilter] = React.useState("TODAS");

  // novo item
  const [title, setTitle] = React.useState("");
  const [assignee, setAssignee] = React.useState("");
  const [priority, setPriority] = React.useState("NORMAL");
  const [tag, setTag] = React.useState("Cross Docking");
  const [dueAt, setDueAt] = React.useState("");
  const [notes, setNotes] = React.useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await api.getBoard(dateKey);
      setCards(res.cards || []);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { load().catch(()=>{}); }, [dateKey]);
  React.useEffect(() => {
    const stop = connectStream(() => load().catch(()=>{}));
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey]);

  const assignees = React.useMemo(() => {
    const s = new Set();
    for (const c of cards) {
      const a = (c.assignee || "").trim();
      if (a) s.add(a);
    }
    return ["TODOS", ...Array.from(s).sort((a,b)=>a.localeCompare(b))];
  }, [cards]);

  const filtered = React.useMemo(() => {
    const qq = q.trim().toLowerCase();
    return (cards || []).filter(c => {
      if (qq) {
        const hay = `${c.title || ""} ${c.notes || ""} ${c.assignee || ""}`.toLowerCase();
        if (!hay.includes(qq)) return false;
      }
      if (prioFilter !== "TODAS") {
        const p = (c.priority || "NORMAL").toUpperCase();
        if (p !== prioFilter) return false;
      }
      if (assigneeFilter !== "TODOS") {
        if ((c.assignee || "").trim() !== assigneeFilter) return false;
      }
      if (tagFilter !== "TODAS") {
        const t = safeTags(c.tags);
        if (!t.includes(tagFilter)) return false;
      }
      return true;
    });
  }, [cards, q, prioFilter, assigneeFilter, tagFilter]);

  async function addCard() {
    const t = title.trim();
    if (!t) return;

    const due_ms = dueAt ? new Date(dueAt).getTime() : null;
    const tags = tag ? [tag] : [];

    await api.createCard(dateKey, {
      title: t,
      status: "A_FAZER",
      assignee: assignee.trim(),
      priority,
      notes: notes.trim(),
      due_at: due_ms,
      tags
    });

    setTitle("");
    setAssignee("");
    setPriority("NORMAL");
    setTag("Cross Docking");
    setDueAt("");
    setNotes("");

    await load();
  }

  function exportCSV() {
    const rows = filtered.map(c => ({
      id: c.id,
      titulo: c.title,
      status: c.status,
      responsavel: c.assignee || "",
      prioridade: c.priority || "",
      prazo: c.due_at ? new Date(Number(c.due_at)).toISOString() : "",
      iniciado: c.started_at ? new Date(Number(c.started_at)).toISOString() : "",
      concluido: c.completed_at ? new Date(Number(c.completed_at)).toISOString() : "",
      retornos_afazer: c.returns_to_afazer || 0,
      tags: safeTags(c.tags).join("|"),
      notas: (c.notes || "").replaceAll("\n", " ")
    }));

    const headers = Object.keys(rows[0] || { id: "" });
    const csv = [
      headers.join(";"),
      ...rows.map(r => headers.map(h => String(r[h] ?? "").replaceAll(";", ",")).join(";"))
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `operacao_${dateKey}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportPDF() {
    // bem simples: abre uma janela com tabela e usa print
    const w = window.open("", "_blank");
    if (!w) return;

    const cols = ["Status","Título","Responsável","Prioridade","Prazo","Tags","Notas"];
    const rows = filtered.map(c => [
      c.status,
      c.title,
      c.assignee || "—",
      c.priority || "—",
      c.due_at ? new Date(Number(c.due_at)).toLocaleString("pt-BR") : "—",
      safeTags(c.tags).join(", "),
      c.notes || ""
    ]);

    w.document.write(`
      <html><head><title>Operação ${dateKey}</title>
      <style>
        body{font-family:Arial; padding:20px;}
        h2{margin:0 0 12px;}
        table{border-collapse:collapse; width:100%;}
        th,td{border:1px solid #ddd; padding:8px; font-size:12px; vertical-align:top;}
        th{background:#f5f5f5; text-align:left;}
      </style></head><body>
      <h2>Operação — ${dateKey}</h2>
      <table><thead><tr>${cols.map(c=>`<th>${c}</th>`).join("")}</tr></thead>
      <tbody>
        ${rows.map(r=>`<tr>${r.map(x=>`<td>${String(x).replaceAll("<","&lt;")}</td>`).join("")}</tr>`).join("")}
      </tbody></table>
      <script>window.print()</script>
      </body></html>
    `);
    w.document.close();
  }

  return (
    <div className="container">
      <div className="topbar">
        <div className="brand">
          <img src="/fracht-logo.svg" alt="Fracht Log" />
          <div className="subtitle">
            Operação — {dateKey}
            <small style={{opacity:.85}}>Usuário: {user?.email || "—"}</small>
          </div>
        </div>

        <div className="actions">
          <a className="btn" href="/tv" target="_blank" rel="noreferrer">Modo TV</a>
          <button className="btn" onClick={logout}>Sair</button>
        </div>
      </div>

      <div className="panel">
        <div className="row">
          <input
            className="input"
            type="date"
            value={dateKey}
            onChange={(e) => setDateKey(e.target.value)}
          />
          <input
            className="input"
            placeholder="Buscar..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ flex: "1 1 260px", minWidth: 220 }}
          />
          <select className="select" value={prioFilter} onChange={(e)=>setPrioFilter(e.target.value)}>
            <option value="TODAS">Prioridade: Todas</option>
            <option value="NORMAL">Normal</option>
            <option value="ALTA">Alta</option>
          </select>
          <select className="select" value={assigneeFilter} onChange={(e)=>setAssigneeFilter(e.target.value)}>
            {assignees.map(a => <option key={a} value={a}>{a === "TODOS" ? "Responsável: Todos" : a}</option>)}
          </select>
          <select className="select" value={tagFilter} onChange={(e)=>setTagFilter(e.target.value)}>
            <option value="TODAS">Tag: Todas</option>
            {TAGS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <button className="btn" onClick={exportCSV}>Exportar CSV</button>
          <button className="btn" onClick={exportPDF}>Exportar PDF</button>
          <button className="btn" onClick={load} disabled={loading}>{loading ? "Carregando..." : "Resetar dia"}</button>
        </div>

        <div className="row">
          <input
            className="input"
            placeholder="Novo item do dia..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ flex: "2 1 240px", minWidth: 240 }}
          />
          <input
            className="input"
            placeholder="Responsável"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            style={{ flex: "1 1 200px", minWidth: 180 }}
          />
          <select className="select" value={priority} onChange={(e)=>setPriority(e.target.value)}>
            {PRIORIDADES.map(p => <option key={p} value={p}>{p === "NORMAL" ? "Normal" : "Alta"}</option>)}
          </select>
          <select className="select" value={tag} onChange={(e)=>setTag(e.target.value)} style={{ minWidth: 200 }}>
            {TAGS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input
            className="input"
            type="datetime-local"
            value={dueAt}
            onChange={(e)=>setDueAt(e.target.value)}
            style={{ minWidth: 220 }}
          />
          <input
            className="input"
            placeholder="Notas"
            value={notes}
            onChange={(e)=>setNotes(e.target.value)}
            style={{ flex: "2 1 240px", minWidth: 220 }}
          />
          <button className="btn" onClick={addCard}>Adicionar</button>
        </div>
      </div>

      <div className="board">
        {COLS.map(col => {
          const colCards = filtered.filter(c => c.status === col.key);
          return (
            <div key={col.key} className={`col ${col.cls}`}>
              <div className="col-header">
                <div>{col.label}</div>
                <div className="count">{colCards.length}</div>
              </div>
              <div className="cards">
                {colCards.map(card => (
                  <Card key={card.id} card={card} onChanged={load} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
