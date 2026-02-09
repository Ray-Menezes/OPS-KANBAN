import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { login } = useAuth();
  const nav = useNavigate();

  async function submit(e) {
    e.preventDefault();
    await login(email, password);
    nav("/");
  }

  return (
    <form onSubmit={submit} style={{ padding: 40 }}>
      <h2>Login</h2>
      <input placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
      <br />
      <input type="password" placeholder="Senha" value={password} onChange={e=>setPassword(e.target.value)} />
      <br />
      <button>Entrar</button>
    </form>
  );
}
