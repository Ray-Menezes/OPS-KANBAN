export default function Card({ card }) {
  return (
    <div style={{ background: "#fff", padding: 10, marginBottom: 10 }}>
      <strong>{card.title}</strong>
      <div>{card.assignee}</div>
      <div>{card.priority}</div>
    </div>
  );
}
