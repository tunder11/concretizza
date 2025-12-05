const express = require("express")
const path = require("path")
const fs = require("fs")
const sqlite3 = require("sqlite3").verbose()

const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(express.json())
app.use(express.static(path.join(__dirname)))

// Inicializar banco de dados SQLite
const dbPath = path.join(__dirname, "concretizza.db")
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error("Erro ao conectar banco:", err)
  else console.log("Banco de dados conectado")
})

// Criar tabelas se não existirem
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      telefone TEXT NOT NULL,
      email TEXT,
      interesse TEXT,
      valor TEXT,
      status TEXT,
      observacoes TEXT,
      data TEXT
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      email TEXT,
      username TEXT UNIQUE,
      senha TEXT,
      permissao TEXT,
      status TEXT,
      telefone TEXT,
      departamento TEXT,
      ultimoAcesso TEXT
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS agendamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER,
      data TEXT,
      hora TEXT,
      tipo TEXT,
      status TEXT,
      observacoes TEXT
    )
  `)
})

// ===== ROTAS CLIENTES =====
app.get("/api/clientes", (req, res) => {
  db.all("SELECT * FROM clientes ORDER BY data DESC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message })
    res.json(rows || [])
  })
})

app.post("/api/clientes", (req, res) => {
  const { nome, telefone, email, interesse, valor, status, observacoes, data } = req.body
  db.run(
    "INSERT INTO clientes (nome, telefone, email, interesse, valor, status, observacoes, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [nome, telefone, email, interesse, valor, status, observacoes, data],
    function (err) {
      if (err) return res.status(500).json({ error: err.message })
      res.json({ id: this.lastID })
    },
  )
})

app.put("/api/clientes/:id", (req, res) => {
  const { nome, telefone, email, interesse, valor, status, observacoes } = req.body
  db.run(
    "UPDATE clientes SET nome = ?, telefone = ?, email = ?, interesse = ?, valor = ?, status = ?, observacoes = ? WHERE id = ?",
    [nome, telefone, email, interesse, valor, status, observacoes, req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message })
      res.json({ success: true })
    },
  )
})

app.delete("/api/clientes/:id", (req, res) => {
  db.run("DELETE FROM clientes WHERE id = ?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message })
    res.json({ success: true })
  })
})

// ===== ROTAS USUÁRIOS =====
app.get("/api/usuarios", (req, res) => {
  db.all("SELECT * FROM usuarios ORDER BY nome", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message })
    res.json(rows || [])
  })
})

app.post("/api/usuarios", (req, res) => {
  const { nome, email, username, senha, permissao, status, telefone, departamento } = req.body
  db.run(
    "INSERT INTO usuarios (nome, email, username, senha, permissao, status, telefone, departamento, ultimoAcesso) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [nome, email, username, senha, permissao, status, telefone, departamento, new Date().toISOString().split("T")[0]],
    function (err) {
      if (err) return res.status(500).json({ error: err.message })
      res.json({ id: this.lastID })
    },
  )
})

app.put("/api/usuarios/:id", (req, res) => {
  const { nome, email, senha, permissao, status, telefone, departamento } = req.body
  db.run(
    "UPDATE usuarios SET nome = ?, email = ?, senha = ?, permissao = ?, status = ?, telefone = ?, departamento = ? WHERE id = ?",
    [nome, email, senha, permissao, status, telefone, departamento, req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message })
      res.json({ success: true })
    },
  )
})

app.delete("/api/usuarios/:id", (req, res) => {
  db.run("DELETE FROM usuarios WHERE id = ?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message })
    res.json({ success: true })
  })
})

// Servir arquivos estáticos
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../src/pages/login.html"))
})

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor Concretizza rodando na porta ${PORT}`)
})

process.on("SIGINT", () => {
  db.close()
  process.exit()
})
