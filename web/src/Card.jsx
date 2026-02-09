import React from "react";
import { api } from "./api.js";
import { fmtBRDateTime, msToHMS, leadMs, workMs, safeTags } from "./util.js";

const STATUS_LABEL = {
  A_FAZER: "A Fazer",
  EM_ANDAMENTO: "Em andamento",
  BLOQUEADO: "Bloqueado",
  CONCLUIDO: "Concluído"
};

function prioClass(priority) {
  const p = (priority || "NORMAL").toUpperCase();
  return p === "ALTA" ? "prio-alta" : "prio-normal";
}

export default function Card({ card, onChanged }) {
  const [open, setOpen] = React.useState(false);
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [open]);

  const tags = safeTags(card.tags);

  return (
    <>
      <div className="card" onClick={() => setOpen(true)}>
        <div className="card-title">{card.title}</div>
        <div className="meta">
          <span className={`pill ${prioClass(card.priority)}`}>🚩 {(card.priority || "NORMAL").toUpperCase() === "ALTA" ? "Alta" : "Normal"}</span>
          <span className="pill">👤 {(card.assignee || "").trim() ? card.assignee : "—"}</span>
          {card.due_at ? <span className="pill">⏰ {fmtBRDateTime(Number(card.due_at))}</span> : null}
        </div>
      </div>

      {open ? (
        <Modal
          card={card}
          tags={tags}
          now={now}
          onClose={() => setOpen(false)}
          onChanged={async () => { setOpen(false); await onChanged?.(); }}
        />
      ) : null}
    </>
  );
}

function Modal({ card, tags, now, onClose, onChanged }) {
  const [title, setTitle] = React.useState(card.title || "");
  const [assignee, setAssignee] = React.useState(card.assignee || "");
  const [priority, setPriority] = React.useState((card.priority || "NORMAL").toUpperCase());
  const [notes, setNotes] = React.useState(card.notes || "");
  const [dueAt, setDueAt] = React.useState(() => {
    if (!card.due_at) return "";
    const d = new Date(Number(card.due_at));
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });

  const [commentText, setCommentText] = React.useState("");
  const [comments, setComments] = React.useState([]);
  const [attachments, setAttachments] = React.useState([]);

  async function refreshSide() {
    const [c, a] = await Promise.all([
      api.listComments(card.id).catch(()=>({comments:[]})),
      api.listAttachments(card.id).catch(()=>({attachments:[]}))
    ]);
    setComments(c.comments || []);
    setAttachments(a.attachments || []);
  }

  React.useEffect(() => {
    refreshSide().catch(()=>{});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id]);

  async function savePatch(patch) {
    await api.patchCard(card.id, patch);
    await onChanged?.();
  }

  async function move(to) {
    await savePatch({ status: to });
  }

  async function remove() {
    if (!confirm("Excluir este item?")) return;
    await api.deleteCard(card.id);
    await onChanged?.();
  }

  async function saveEdits() {
    const due_ms = dueAt ? new Date(dueAt).getTime() : null;
    await savePatch({
      title: title.trim(),
      assignee: assignee.trim(),
      priority,
      notes: notes,
      due_at: due_ms
    });
  }

  async function sendComment() {
    const t = commentText.trim();
    if (!t) return;
    await api.addComment(card.id, { text: t, author: "operador" });
    setCommentText("");
    await refreshSide();
    await onChanged?.();
  }

  async function uploadFile(file) {
    if (!file) return;
    await api.uploadAttachment(card.id, file);
    await refreshSide();
    await onChanged?.();
  }

  async function delAttachment(attId) {
    await api.deleteAttachment(attId);
    await refreshSide();
    await onChanged?.();
  }

  const lead = leadMs(card, now);
  const work = workMs(card, now);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e)=>e.stopPropagation()}>
        <div className="body">
          <h3>{card.title}</h3>

          <div className="meta" style={{marginBottom:10}}>
            <span className={`pill ${priority === "ALTA" ? "prio-alta" : "prio-normal"}`}>🚩 {priority === "ALTA" ? "Alta" : "Normal"}</span>
            <span className="pill">👤 {(card.assignee || "").trim() ? card.assignee : "—"}</span>
            <span className="pill">📌 {STATUS_LABEL[card.status] || card.status}</span>
            {card.started_at ? <span className="pill">🟢 {fmtBRDateTime(Number(card.started_at))}</span> : null}
          </div>

          {tags.length ? <div className="meta" style={{marginBottom:10}}>{tags.map(t => <span key={t} className="pill">🏷 {t}</span>)}</div> : null}

          <div className="grid2">
            <button className="btn2" onClick={() => move("A_FAZER")}>→ A Fazer</button>
            <button className="btn2" onClick={() => move("BLOQUEADO")}>→ Bloqueado</button>
            <button className="btn2" onClick={() => move("CONCLUIDO")}>→ Concluído</button>
            <button className="btn2 primary" onClick={() => move("EM_ANDAMENTO")}>→ Em andamento</button>
          </div>

          <div className="divider" />

          <div className="grid2">
            <button className="btn2" onClick={saveEdits}>Salvar alterações</button>
            <button className="btn2 danger" onClick={remove}>Excluir</button>
          </div>

          <div className="divider" />

          <div className="grid2">
            <div>
              <div className="small"><b>Lead time (A Fazer → Concluído)</b></div>
              <div style={{fontWeight:950, fontSize:14}}>⏱ {msToHMS(lead)}</div>
              <div className="small">Retornos p/ A Fazer: <b>{card.returns_to_afazer || 0}</b></div>
            </div>
            <div>
              <div className="small"><b>Work time (só Em andamento)</b></div>
              <div style={{fontWeight:950, fontSize:14}}>🛠 {msToHMS(work)}</div>
              <div className="small">{card.status === "EM_ANDAMENTO" ? "Rodando" : (card.status === "BLOQUEADO" ? "Pausado" : (card.status === "CONCLUIDO" ? "Finalizado" : "Aguardando"))}</div>
            </div>
          </div>

          <div className="divider" />

          <div className="grid2">
            <div>
              <div className="small"><b>Título</b></div>
              <input className="input" value={title} onChange={(e)=>setTitle(e.target.value)} />
            </div>
            <div>
              <div className="small"><b>Responsável (editável)</b></div>
              <input className="input" value={assignee} onChange={(e)=>setAssignee(e.target.value)} placeholder="Nome" />
            </div>

            <div>
              <div className="small"><b>Prioridade</b></div>
              <select className="select" value={priority} onChange={(e)=>setPriority(e.target.value)}>
                <option value="NORMAL">Normal</option>
                <option value="ALTA">Alta</option>
              </select>
            </div>
            <div>
              <div className="small"><b>Prazo (data/hora)</b></div>
              <input className="input" type="datetime-local" value={dueAt} onChange={(e)=>setDueAt(e.target.value)} />
            </div>
          </div>

          <div style={{marginTop:8}}>
            <div className="small"><b>Notas</b></div>
            <textarea className="input" value={notes} onChange={(e)=>setNotes(e.target.value)} rows={3} style={{height:"auto", padding:"10px 12px"}} />
          </div>

          <div className="divider" />

          <div className="grid2">
            <div>
              <div className="small"><b>Comentários</b></div>
              <div className="row" style={{gap:8}}>
                <input className="input" value={commentText} onChange={(e)=>setCommentText(e.target.value)} placeholder="Digite um comentário..." style={{flex:"1 1 auto", minWidth:0}} />
                <button className="btn2 primary" onClick={sendComment}>Enviar</button>
              </div>

              <div className="list" style={{marginTop:8}}>
                {comments.length ? comments.map(c => (
                  <div key={c.id} className="item">
                    <b>{c.author}</b> • {new Date(Number(c.created_at)).toLocaleString("pt-BR")}
                    <div style={{marginTop:4}}>{c.text}</div>
                  </div>
                )) : <div className="small">Sem comentários.</div>}
              </div>
            </div>

            <div>
              <div className="small"><b>Anexos (foto/vídeo)</b></div>
              <div className="row" style={{gap:8}}>
                <input className="input" type="file" accept="image/*,video/*" onChange={(e)=>uploadFile(e.target.files?.[0])} />
              </div>

              <div className="list" style={{marginTop:8}}>
                {attachments.length ? attachments.map(a => (
                  <div key={a.id} className="item">
                    <div style={{display:"flex", justifyContent:"space-between", gap:10}}>
                      <a href={a.url} target="_blank" rel="noreferrer"><b>{a.original_name}</b></a>
                      <button className="btn2 danger" onClick={()=>delAttachment(a.id)}>Excluir</button>
                    </div>
                    <div className="small">{a.mime} • {(a.size/1024).toFixed(1)} KB</div>
                  </div>
                )) : <div className="small">Sem anexos.</div>}
              </div>
            </div>
          </div>

          <div className="divider" />
          <div className="row" style={{justifyContent:"flex-end"}}>
            <button className="btn2" onClick={onClose}>Fechar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
