import React, { createContext, useContext, useState } from "react";
import axios from "axios";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem("token"));

  async function login(email, password) {
    const res = await axios.post("http://localhost:4001/api/login", {
      email,
      password
    });
    localStorage.setItem("token", res.data.token);
    setToken(res.data.token);
  }

  function logout() {
    localStorage.removeItem("token");
    setToken(null);
  }

  return (
    <AuthCtx.Provider value={{ token, login, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  return useContext(AuthCtx);
}
