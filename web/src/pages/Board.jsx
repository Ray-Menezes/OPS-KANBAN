import { useEffect, useState } from "react";
import { useAuth } from "../auth";
import { api } from "../api";
import Card from "../components/Card";

const COLS = ["A_FAZER", "EM_ANDAMENTO", "BLOQUEADO", "CONCLUIDO"];

export default function Board() {
  const { token } = useAuth();
  const [cards, setCards] = useState([]);

  useEffect(() => {
    api(token)
      .get("/api/board/2026-02-09")
      .then(r => setCards(r.data.cards));
  }, []);

  return (
    <div style={{ display: "flex", gap: 20, padding: 20 }}>
      {COLS.map(c => (
        <div key={c} style={{ width: 300 }}>
          <h3>{c}</h3>
          {cards.filter(x => x.status === c).map(card => (
            <Card key={card.id} card={card} />
          ))}
        </div>
      ))}
    </div>
  );
}
