import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { api } from "../api.js";

export default function Login() {
  const nav = useNavigate();
  const { token, login } = useAuth();

  const [email, setEmail] = React.useState("ray@fracht.com");
  const [password, setPassword] = React.useState("");
  const [seedPwd, setSeedPwd] = React.useState("");
  const [msg, setMsg] = React.useState("");

  React.useEffect(() => {
    if (token) nav("/", { replace: true });
  }, [token, nav]);

  async function doLogin(e) {
    e.preventDefault();
    setMsg("");
    try {
      await login(email.trim(), password);
      nav("/", { replace: true });
    } catch (err) {
      setMsg("Login inválido. Se for a primeira vez, crie/atualize a senha abaixo (Seed).");
    }
  }

  async function doSeed(e) {
    e.preventDefault();
    setMsg("");
    try {
      await api.seed(email.trim(), seedPwd);
      setMsg("Senha criada/atualizada! Agora faça login.");
    } catch (err) {
      setMsg("Não foi possível criar senha (seed). Verifique o servidor.");
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h2>Operação • Login</h2>
        <div className="muted">
          Primeira vez? Use <b>Seed</b> para criar a senha do usuário.
        </div>

        <form onSubmit={doLogin} className="row" style={{gap:10}}>
          <input className="input" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="email" style={{width:"100%"}} />
          <input className="input" value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="senha" type="password" style={{width:"100%"}} />
          <button className="btn" type="submit" style={{width:"100%"}}>Entrar</button>
        </form>

        <div className="divider" />

        <form onSubmit={doSeed} className="row" style={{gap:10}}>
          <input className="input" value={seedPwd} onChange={(e)=>setSeedPwd(e.target.value)} placeholder="nova senha (seed)" type="password" style={{width:"100%"}} />
          <button className="btn" type="submit" style={{width:"100%"}}>Criar/Atualizar senha</button>
        </form>

        {msg ? <div className="muted" style={{marginTop:10}}>{msg}</div> : null}
      </div>
    </div>
  );
}
