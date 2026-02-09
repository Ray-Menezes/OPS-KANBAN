export function pad2(n) {
  return String(n).padStart(2, "0");
}

export function fmtDateKey(d) {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const da = pad2(d.getDate());
  return `${y}-${m}-${da}`;
}

export function fmtBRDateTime(ms) {
  if (!ms) return "—";
  const d = new Date(ms);
  return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function msToHMS(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(ss)}`;
}

export function leadMs(card, nowMs) {
  const start = card.started_at || card.updated_at || 0;
  const end = card.completed_at || nowMs;
  return Math.max(0, end - start);
}

export function workMs(card, nowMs) {
  const acc = Number(card.work_accum_ms || 0);
  const running = card.status === "EM_ANDAMENTO" && card.work_started_at ? (nowMs - card.work_started_at) : 0;
  return Math.max(0, acc + running);
}

export function safeTags(tags) {
  try {
    if (!tags) return [];
    if (Array.isArray(tags)) return tags;
    if (typeof tags === "string") return JSON.parse(tags);
  } catch {}
  return [];
}
