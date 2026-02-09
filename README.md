# OPS Kanban (Fracht) — setup

## 1) Pré-requisitos
- Node.js LTS instalado (recomendado 18+)

## 2) Backend
```bash
cd ops-kanban/server
npm install
npm run dev
```
Servidor sobe em: http://localhost:4001

## 3) Frontend
```bash
cd ops-kanban/web
npm install
npm run dev
```
Frontend em: http://localhost:5173

## 4) Criar/atualizar senha do usuário (Seed)
- Abra http://localhost:5173/login
- Informe o email e use **Criar/Atualizar senha**
- Depois faça login

Obs: O endpoint `/api/admin/seed` atualiza a senha se o email já existir.
