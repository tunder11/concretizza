require("dotenv").config()
const express = require("express")
const path = require("path")
const fs = require("fs")
const { Pool } = require("pg")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const { body, validationResult, param } = require("express-validator")
const cors = require("cors")
const rateLimit = require("express-rate-limit")

const app = express()
const PORT = process.env.PORT || 3000
const JWT_SECRET = process.env.JWT_SECRET || "sua_chave_jwt_super_secreta_aqui_min_32_caracteres"
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 10

app.set('trust proxy', 1)

// ===== MIDDLEWARE DE SEGURANÇA =====
app.use(cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:3000",
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}))

const limiter = rateLimit({
  windowMs: (process.env.RATE_LIMIT_WINDOW || 15) * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 1000,
  message: "Muitas requisições, tente novamente mais tarde",
  skip: (req) => {
    return !req.path.startsWith('/api/')
  },
  keyGenerator: (req) => {
    return req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown'
  }
})

app.use(limiter)
app.use(express.json({ limit: "1mb" }))
app.use(express.urlencoded({ limit: "1mb", extended: true }))

app.use((req, res, next) => {
  if (req.url.endsWith('.js') || req.url.endsWith('.css') || req.url.endsWith('.html')) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0')
    res.set('Pragma', 'no-cache')
    res.set('Expires', '0')
  }
  next()
})

app.use(express.static(path.join(__dirname, "src")))
app.use("/src", express.static(path.join(__dirname, "src")))
app.use(express.static(path.join(__dirname)))

// ===== MIDDLEWARE DE AUTENTICAÇÃO JWT =====
function autenticar(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1]
  
  if (!token) {
    console.log("[AUTH] Token não fornecido")
    return res.status(401).json({ error: "Token não fornecido" })
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    console.log("[AUTH] Token verificado:", decoded)
    req.usuario = decoded
    next()
  } catch (err) {
    console.log("[AUTH] Token inválido:", err.message)
    return res.status(401).json({ error: "Token inválido ou expirado" })
  }
}

// ===== MIDDLEWARE DE AUTORIZAÇÃO =====
function autorizar(...cargos) {
  return (req, res, next) => {
    console.log(`[AUTORIZAR] Verificando cargo "${req.usuario.cargo}" contra [${cargos.join(", ")}]`)
    if (!cargos.includes(req.usuario.cargo)) {
      console.log(`[AUTORIZAR] Permissão negada para cargo "${req.usuario.cargo}"`)
      return res.status(403).json({ error: "Permissão negada" })
    }
    console.log(`[AUTORIZAR] Permissão concedida para cargo "${req.usuario.cargo}"`)
    next()
  }
}

// ===== VALIDAÇÃO DE ERROS =====
function validarRequisicao(req, res, next) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    const mensagem = errors.array().map(e => e.msg).join("; ")
    return res.status(400).json({ error: mensagem })
  }
  next()
}

// ===== INICIALIZAR BANCO DE DADOS =====
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
})

pool.on('error', (err) => {
  console.error('❌ Erro no pool PostgreSQL:', err.message)
})

pool.on('connect', () => {
  console.log('✓ PostgreSQL conectado')
})

const db = {
  get: (sql, params, callback) => {
    if (typeof params === 'function') {
      callback = params
      params = []
    }
    if (!callback) {
      callback = () => {}
    }
    pool.query(sql, params, (err, result) => {
      if (err) return callback(err)
      callback(null, result.rows[0])
    })
  },
  all: (sql, params, callback) => {
    if (typeof params === 'function') {
      callback = params
      params = []
    }
    if (!callback) {
      callback = () => {}
    }
    pool.query(sql, params, (err, result) => {
      if (err) return callback(err)
      callback(null, result.rows)
    })
  },
  run: (sql, params, callback) => {
    if (typeof params === 'function') {
      callback = params
      params = []
    }
    if (!callback) {
      callback = () => {}
    }
    pool.query(sql, params, (err, result) => {
      if (err) return callback(err)
      callback(null, { lastID: result.rows[0]?.id, changes: result.rowCount })
    })
  }
}

// ===== CRIAR TABELAS =====
async function initializeTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        nome TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        username TEXT UNIQUE NOT NULL,
        senha TEXT NOT NULL,
        permissao TEXT DEFAULT 'visualizar',
        status TEXT DEFAULT 'ativo',
        telefone TEXT,
        departamento TEXT,
        ultimoAcesso TEXT,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    console.log("✓ Tabela usuarios criada")

    await pool.query(`
      CREATE TABLE IF NOT EXISTS clientes (
        id SERIAL PRIMARY KEY,
        nome TEXT NOT NULL,
        telefone TEXT NOT NULL,
        email TEXT,
        interesse TEXT,
        valor TEXT,
        status TEXT,
        observacoes TEXT,
        data TEXT,
        usuario_id INTEGER REFERENCES usuarios(id),
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    console.log("✓ Tabela clientes criada")

    await pool.query(`
      CREATE TABLE IF NOT EXISTS agendamentos (
        id SERIAL PRIMARY KEY,
        cliente_id INTEGER NOT NULL REFERENCES clientes(id),
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
        data TEXT NOT NULL,
        hora TEXT NOT NULL,
        tipo TEXT,
        status TEXT DEFAULT 'agendado',
        observacoes TEXT,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    console.log("✓ Tabela agendamentos criada")

    await pool.query(`
      CREATE TABLE IF NOT EXISTS logs_auditoria (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER REFERENCES usuarios(id),
        acao TEXT NOT NULL,
        modulo TEXT NOT NULL,
        descricao TEXT,
        usuario_afetado TEXT,
        ip_address TEXT,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    
    // Garantir que a coluna usuario_afetado exista (migração)
    try {
      await pool.query("ALTER TABLE logs_auditoria ADD COLUMN IF NOT EXISTS usuario_afetado TEXT")
    } catch (e) {
      console.log("Nota: Coluna usuario_afetado já existe ou erro ao adicionar:", e.message)
    }

    console.log("✓ Tabela logs_auditoria criada/verificada")
  } catch (error) {
    console.error("Erro ao criar tabelas:", error.message)
  }
}

// ===== FUNÇÃO DE LOG =====
async function registrarLog(usuarioId, acao, modulo, descricao, usuarioAfetado = null, req = null) {
  try {
    const ip = req ? (req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for']?.split(',')[0]?.trim()) : null
    
    await pool.query(
      "INSERT INTO logs_auditoria (usuario_id, acao, modulo, descricao, usuario_afetado, ip_address) VALUES ($1, $2, $3, $4, $5, $6)",
      [usuarioId, acao, modulo, descricao, usuarioAfetado, ip]
    )
    console.log(`[LOG] ${acao} - ${modulo}: ${descricao}`)
  } catch (err) {
    console.error("[LOG] Erro ao registrar log:", err.message)
  }
}

initializeTables()

// ===== AUTO-SEED USUÁRIOS PADRÃO =====
const usuariosPadrao = [
  {
    nome: "Head Admin",
    email: "head@concretizza.com",
    username: "head",
    password: "123456",
    permissao: "head-admin"
  },
  {
    nome: "Administrador",
    email: "admin@concretizza.com",
    username: "admin",
    password: "123456",
    permissao: "admin"
  },
  {
    nome: "Corretor(a)",
    email: "corretor@concretizza.com",
    username: "corretor",
    password: "123456",
    permissao: "corretor"
  },
  {
    nome: "Visualizador",
    email: "viewer@concretizza.com",
    username: "viewer",
    password: "123456",
    permissao: "visualizar"
  }
]

async function seedDefaultUsers() {
  try {
    const result = await pool.query("SELECT COUNT(*) as count FROM usuarios")
    const count = parseInt(result.rows[0].count)

    if (count === 0) {
      console.log("📝 Criando usuários padrão...")
      for (const usuario of usuariosPadrao) {
        const senhaHash = await bcrypt.hash(usuario.password, BCRYPT_ROUNDS)
        await pool.query(
          `INSERT INTO usuarios (nome, email, username, senha, permissao, status)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (username) DO NOTHING`,
          [usuario.nome, usuario.email, usuario.username, senhaHash, usuario.permissao, "ativo"]
        )
        console.log(`  ✓ ${usuario.username}`)
      }
      console.log("✓ Usuários padrão criados com sucesso!")
    }
  } catch (error) {
    console.error("❌ Erro ao criar usuários padrão:", error.message)
  }
}

setTimeout(() => seedDefaultUsers(), 2000)

// ===== ROTA DE AUTENTICAÇÃO (LOGIN) =====
app.post(
  "/api/auth/login",
  [
    body("username").trim().notEmpty().withMessage("Usuário é obrigatório"),
    body("password").notEmpty().withMessage("Senha é obrigatória")
  ],
  validarRequisicao,
  (req, res) => {
    const { username, password } = req.body
    console.log(`[LOGIN] Tentativa de login para usuário: ${username}`)
    
    db.get(
      "SELECT id, nome, email, username, senha, permissao FROM usuarios WHERE (username = $1 OR email = $2) AND status = $3",
      [username, username, "ativo"],
      (err, user) => {
        if (err) {
          console.log(`[LOGIN] Erro ao buscar usuário:`, err)
          return res.status(500).json({ error: "Erro no servidor" })
        }
        
        if (!user) {
          console.log(`[LOGIN] Usuário não encontrado: ${username}`)
          return res.status(401).json({ error: "Usuário ou senha incorretos" })
        }

        console.log(`[LOGIN] Usuário encontrado: ${user.username}, permissao: ${user.permissao}`)

        bcrypt.compare(password, user.senha, (err, isValid) => {
          if (err) {
            console.log(`[LOGIN] Erro ao comparar senha:`, err)
            return res.status(500).json({ error: "Erro no servidor" })
          }
          
          if (!isValid) {
            console.log(`[LOGIN] Senha inválida para ${username}`)
            return res.status(401).json({ error: "Usuário ou senha incorretos" })
          }

          console.log(`[LOGIN] Autenticação bem-sucedida para ${username}`)
          const token = jwt.sign(
            { id: user.id, username: user.username, cargo: user.permissao },
            JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRE || "24h" }
          )

          console.log(`[LOGIN] Token gerado para ${username}, cargo: ${user.permissao}`)

          db.run("UPDATE usuarios SET ultimoAcesso = $1 WHERE id = $2", [new Date().toISOString(), user.id])

          registrarLog(user.id, "LOGIN", "Autenticação", "Usuário realizou login", user.nome, req)

          res.json({
            token,
            usuario: {
              id: user.id,
              nome: user.nome,
              email: user.email,
              cargo: user.permissao
            }
          })
        })
      }
    )
  }
)

// ===== ROTA DE REGISTRO (CRIAR USUÁRIO) =====
app.post(
  "/api/auth/register",
  [
    body("nome").trim().isLength({ min: 3 }).withMessage("Nome deve ter no mínimo 3 caracteres"),
    body("email").isEmail().withMessage("Email inválido"),
    body("username").trim().isLength({ min: 3 }).withMessage("Username deve ter no mínimo 3 caracteres"),
    body("password").isLength({ min: 6 }).withMessage("Senha deve ter no mínimo 6 caracteres")
  ],
  validarRequisicao,
  (req, res) => {
    const { nome, email, username, password } = req.body

    bcrypt.hash(password, BCRYPT_ROUNDS, (err, senhaHash) => {
      if (err) return res.status(500).json({ error: "Erro ao processar senha" })

      db.run(
        "INSERT INTO usuarios (nome, email, username, senha, permissao, status) VALUES ($1, $2, $3, $4, $5, $6)",
        [nome, email, username, senhaHash, "corretor", "ativo"],
        function (err) {
          if (err) {
            if (err.message.includes("UNIQUE")) {
              return res.status(400).json({ error: "Email ou username já cadastrado" })
            }
            return res.status(500).json({ error: "Erro ao criar usuário" })
          }
          
          registrarLog(this.lastID, "CRIAR", "Usuários", `Auto-cadastro: ${username}`, nome, req)
          
          res.status(201).json({ id: this.lastID, message: "Usuário criado com sucesso" })
        }
      )
    })
  }
)

// ===== ROTAS DE CLIENTES =====
app.get("/api/clientes", autenticar, (req, res) => {
  db.all(
    "SELECT id, nome, telefone, email, interesse, valor, status, observacoes, data FROM clientes ORDER BY data DESC",
    (err, rows) => {
      if (err) return res.status(500).json({ error: "Erro ao buscar clientes" })
      res.json(rows || [])
    }
  )
})

app.post(
  "/api/clientes",
  autenticar,
  autorizar("admin", "head-admin", "corretor"),
  [
    body("nome").trim().notEmpty().withMessage("Nome é obrigatório"),
    body("telefone").trim().notEmpty().withMessage("Telefone é obrigatório"),
    body("email").optional({ checkFalsy: true }).trim().isEmail().withMessage("Email deve ser válido se informado"),
    body("interesse").trim().notEmpty().withMessage("Interesse é obrigatório"),
    body("status").trim().notEmpty().withMessage("Status é obrigatório")
  ],
  validarRequisicao,
  async (req, res) => {
    const { nome, telefone, email, interesse, valor, status, observacoes, data } = req.body
    
    console.log("[CLIENTES] Criando novo cliente:", { nome, telefone, email, interesse, valor, status, observacoes, data })
    
    try {
      const result = await pool.query(
        "INSERT INTO clientes (nome, telefone, email, interesse, valor, status, observacoes, data, usuario_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id",
        [nome, telefone, email || null, interesse, valor || null, status, observacoes || null, data, req.usuario.id]
      )
      const clienteId = result.rows[0]?.id
      console.log("[CLIENTES] Cliente criado com sucesso, ID:", clienteId)
      await registrarLog(req.usuario.id, "CRIAR", "Clientes", `Cliente criado: ${nome}`, nome, req)
      res.status(201).json({ id: clienteId, message: "Cliente criado com sucesso" })
    } catch (err) {
      console.error("[CLIENTES] Erro ao inserir cliente:", err)
      res.status(500).json({ error: "Erro ao criar cliente: " + err.message })
    }
  }
)

app.put(
  "/api/clientes/:id",
  autenticar,
  autorizar("admin", "head-admin", "corretor"),
  [
    param("id").isInt().withMessage("ID inválido"),
    body("nome").optional().trim().notEmpty().withMessage("Nome não pode estar vazio"),
    body("email").optional({ checkFalsy: true }).trim().isEmail().withMessage("Email deve ser válido se informado")
  ],
  validarRequisicao,
  async (req, res) => {
    const { id } = req.params
    const { nome, telefone, email, interesse, valor, status, observacoes } = req.body
    
    try {
      const result = await pool.query(
        "UPDATE clientes SET nome = $1, telefone = $2, email = $3, interesse = $4, valor = $5, status = $6, observacoes = $7, atualizado_em = CURRENT_TIMESTAMP WHERE id = $8",
        [nome, telefone, email, interesse, valor, status, observacoes, id]
      )
      if (result.rowCount === 0) return res.status(404).json({ error: "Cliente não encontrado" })
      await registrarLog(req.usuario.id, "EDITAR", "Clientes", `Cliente atualizado: ${nome || id}`, nome || id, req)
      res.json({ success: true, message: "Cliente atualizado com sucesso" })
    } catch (err) {
      console.error("[CLIENTES PUT] Erro ao atualizar cliente:", err)
      res.status(500).json({ error: "Erro ao atualizar cliente: " + err.message })
    }
  }
)

app.delete(
  "/api/clientes/:id",
  autenticar,
  autorizar("admin", "head-admin", "corretor"),
  [param("id").isInt().withMessage("ID inválido")],
  validarRequisicao,
  async (req, res) => {
    const { id } = req.params
    
    try {
      const clienteResult = await pool.query("SELECT nome FROM clientes WHERE id = $1", [id])
      const cliente = clienteResult.rows[0]
      const clienteNome = cliente?.nome || id
      
      const deleteResult = await pool.query("DELETE FROM clientes WHERE id = $1", [id])
      
      if (deleteResult.rowCount === 0) {
        return res.status(404).json({ error: "Cliente não encontrado" })
      }
      
      await registrarLog(req.usuario.id, "DELETAR", "Clientes", `Cliente deletado: ${id}`, clienteNome, req)
      res.json({ success: true, message: "Cliente deletado com sucesso" })
    } catch (error) {
      console.error("[CLIENTES DELETE] Erro ao deletar cliente:", error)
      res.status(500).json({ error: "Erro ao deletar cliente: " + error.message })
    }
  }
)

// ===== ROTAS DE USUÁRIOS (APENAS PARA ADMINS) =====
app.get(
  "/api/usuarios",
  autenticar,
  autorizar("admin", "head-admin"),
  (req, res) => {
    db.all(
      "SELECT id, nome, email, username, permissao, status, telefone, departamento, ultimoAcesso FROM usuarios ORDER BY nome",
      (err, rows) => {
        if (err) return res.status(500).json({ error: "Erro ao buscar usuários" })
        res.json(rows || [])
      }
    )
  }
)

app.post(
  "/api/usuarios",
  autenticar,
  autorizar("head-admin", "admin"),
  [
    body("nome").trim().notEmpty().withMessage("Nome é obrigatório"),
    body("email").isEmail().withMessage("Email inválido"),
    body("username").trim().isLength({ min: 3 }).withMessage("Username deve ter no mínimo 3 caracteres"),
    body("password").isLength({ min: 6 }).withMessage("Senha deve ter no mínimo 6 caracteres"),
    body("permissao").trim().notEmpty().withMessage("Permissão é obrigatória")
  ],
  validarRequisicao,
  async (req, res) => {
    const { nome, email, username, password, permissao, status, telefone, departamento } = req.body
    const cargoUsuarioLogado = req.usuario.cargo.toLowerCase()

    if (cargoUsuarioLogado === "admin" && (permissao.toLowerCase() === "admin" || permissao.toLowerCase() === "head-admin")) {
      return res.status(403).json({ error: "Admin não pode criar usuários com cargo admin ou superior" })
    }

    try {
      const senhaHash = await new Promise((resolve, reject) => {
        bcrypt.hash(password, BCRYPT_ROUNDS, (err, hash) => {
          if (err) reject(err)
          else resolve(hash)
        })
      })

      const result = await pool.query(
        "INSERT INTO usuarios (nome, email, username, senha, permissao, status, telefone, departamento) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
        [nome, email, username, senhaHash, permissao.toLowerCase(), status || "ativo", telefone || null, departamento || null]
      )
      const usuarioId = result.rows[0]?.id
      await registrarLog(req.usuario.id, "CRIAR", "Usuários", `Usuário criado: ${username}`, nome, req)
      res.status(201).json({ id: usuarioId, message: "Usuário criado com sucesso" })
    } catch (err) {
      console.error("[USUARIOS POST] Erro ao criar usuário:", err)
      if (err.message?.includes("UNIQUE")) {
        return res.status(400).json({ error: "Email ou username já cadastrado" })
      }
      res.status(500).json({ error: "Erro ao criar usuário: " + err.message })
    }
  }
)

app.put(
  "/api/usuarios/:id",
  autenticar,
  autorizar("head-admin", "admin"),
  [param("id").isInt().withMessage("ID inválido")],
  validarRequisicao,
  async (req, res) => {
    const { id } = req.params
    const { nome, email, password, permissao, status, telefone, departamento } = req.body
    const cargoUsuarioLogado = req.usuario.cargo.toLowerCase()
    const usuarioIdSendoEditado = parseInt(id)

    try {
      const userResult = await pool.query("SELECT permissao, nome as nome_atual FROM usuarios WHERE id = $1", [usuarioIdSendoEditado])
      const usuarioAlvo = userResult.rows[0]

      if (!usuarioAlvo) return res.status(404).json({ error: "Usuário não encontrado" })

      const cargoAlvo = usuarioAlvo.permissao.toLowerCase()

      if (cargoUsuarioLogado === "admin" && (cargoAlvo === "admin" || cargoAlvo === "head-admin")) {
        return res.status(403).json({ error: "Admin não pode editar usuários com cargo igual ou superior" })
      }

      let senhaHash = null
      if (password) {
        senhaHash = await new Promise((resolve, reject) => {
          bcrypt.hash(password, BCRYPT_ROUNDS, (err, hash) => {
            if (err) reject(err)
            else resolve(hash)
          })
        })
      }

      let result
      if (password) {
        result = await pool.query(
          "UPDATE usuarios SET nome = $1, email = $2, senha = $3, permissao = $4, status = $5, telefone = $6, departamento = $7, atualizado_em = CURRENT_TIMESTAMP WHERE id = $8",
          [nome, email, senhaHash, permissao.toLowerCase(), status, telefone, departamento, id]
        )
      } else {
        result = await pool.query(
          "UPDATE usuarios SET nome = $1, email = $2, permissao = $3, status = $4, telefone = $5, departamento = $6, atualizado_em = CURRENT_TIMESTAMP WHERE id = $7",
          [nome, email, permissao.toLowerCase(), status, telefone, departamento, id]
        )
      }

      if (result.rowCount === 0) return res.status(404).json({ error: "Usuário não encontrado" })
      await registrarLog(req.usuario.id, "EDITAR", "Usuários", `Usuário atualizado: ${nome || id}`, nome || id, req)
      res.json({ success: true, message: "Usuário atualizado com sucesso" })
    } catch (err) {
      console.error("[UPDATE USER] Erro ao atualizar usuário:", err)
      if (err.message?.includes("UNIQUE")) {
        return res.status(400).json({ error: "Email já cadastrado" })
      }
      res.status(500).json({ error: "Erro ao atualizar usuário: " + err.message })
    }
  }
)

app.delete(
  "/api/usuarios/:id",
  autenticar,
  autorizar("head-admin", "admin"),
  [param("id").isInt().withMessage("ID inválido")],
  validarRequisicao,
  async (req, res) => {
    const { id } = req.params
    const usuarioId = parseInt(id)
    const usuarioAtual = req.usuario

    console.log(`[DELETE USUARIO] Tentativa de deletar usuário ${usuarioId} por ${usuarioAtual.cargo} (ID: ${usuarioAtual.id})`)

    if (usuarioId === usuarioAtual.id) {
      console.log("[DELETE USUARIO] Erro: tentativa de deletar a própria conta")
      return res.status(400).json({ error: "Você não pode deletar sua própria conta" })
    }

    const client = await pool.connect()

    try {
      // Verificar usuário alvo e permissões
      const userResult = await client.query("SELECT permissao, nome FROM usuarios WHERE id = $1", [usuarioId])
      const usuarioAlvo = userResult.rows[0]

      if (!usuarioAlvo) {
        console.log("[DELETE USUARIO] Usuário não encontrado")
        return res.status(404).json({ error: "Usuário não encontrado" })
      }

      const cargoUsuarioLogado = usuarioAtual.cargo?.toLowerCase()
      const cargoUsuarioAlvo = usuarioAlvo.permissao?.toLowerCase()

      if (cargoUsuarioLogado === "admin" && (cargoUsuarioAlvo === "admin" || cargoUsuarioAlvo === "head-admin")) {
        console.log("[DELETE USUARIO] Erro: Admin tentou deletar usuário com cargo igual ou superior")
        return res.status(403).json({ error: "Admin não pode deletar usuários com cargo igual ou superior" })
      }

      // Iniciar transação
      await client.query('BEGIN')

      // 1. Remover agendamentos do usuário
      await client.query("DELETE FROM agendamentos WHERE usuario_id = $1", [usuarioId])

      // 2. Desvincular clientes (setar usuario_id = NULL)
      await client.query("UPDATE clientes SET usuario_id = NULL WHERE usuario_id = $1", [usuarioId])

      // 3. Desvincular logs de auditoria
      await client.query("UPDATE logs_auditoria SET usuario_id = NULL WHERE usuario_id = $1", [usuarioId])

      // 4. Deletar o usuário
      const deleteResult = await client.query("DELETE FROM usuarios WHERE id = $1", [usuarioId])

      if (deleteResult.rowCount === 0) {
        await client.query('ROLLBACK')
        return res.status(404).json({ error: "Usuário não encontrado durante a exclusão" })
      }

      await client.query('COMMIT')
      
      console.log("[DELETE USUARIO] Usuário e dados relacionados processados com sucesso")
      await registrarLog(req.usuario.id, "DELETAR", "Usuários", `Usuário deletado: ${usuarioId}`, usuarioAlvo?.nome || usuarioId, req)
      res.json({ success: true, message: "Usuário deletado com sucesso" })

    } catch (err) {
      await client.query('ROLLBACK')
      console.error("[DELETE USUARIO] Erro ao deletar:", err)
      res.status(500).json({ error: "Erro ao deletar usuário: " + err.message })
    } finally {
      client.release()
    }
  }
)

// ===== ROTAS DE LOGS =====
app.get("/api/logs", autenticar, autorizar("head-admin", "admin"), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT l.*, u.nome as usuario_nome, u.username as usuario_username 
       FROM logs_auditoria l 
       LEFT JOIN usuarios u ON l.usuario_id = u.id 
       ORDER BY l.criado_em DESC`
    )
    
    const logsFormatados = result.rows.map(log => {
      const data = new Date(log.criado_em)
      return {
        id: log.id,
        acao: log.acao,
        modulo: log.modulo,
        descricao: log.descricao,
        usuarioLogado: log.usuario_nome || log.usuario_username || "Sistema/Deletado",
        usuarioAfetado: log.usuario_afetado,
        dataFormatada: data.toLocaleDateString('pt-BR'),
        horaFormatada: data.toLocaleTimeString('pt-BR'),
        ip: log.ip_address
      }
    })
    
    res.json(logsFormatados)
  } catch (err) {
    console.error("[LOGS] Erro ao buscar logs:", err)
    res.status(500).json({ error: "Erro ao buscar logs: " + err.message })
  }
})

// ===== SERVIR ARQUIVO RAIZ =====
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "src", "pages", "index.html"))
})

app.get("/pages/:page", (req, res) => {
  const { page } = req.params
  res.sendFile(path.join(__dirname, "src", "pages", `${page}.html`))
})

// ===== TRATAMENTO DE ERROS =====
app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ error: "Erro interno do servidor" })
})

app.use((req, res) => {
  res.status(404).json({ error: "Rota não encontrada" })
})

// ===== INICIAR SERVIDOR =====
app.listen(PORT, () => {
  console.log(`Servidor Concretizza rodando na porta ${PORT}`)
  console.log(`Ambiente: ${process.env.NODE_ENV || "development"}`)
})

process.on("SIGINT", () => {
  db.close()
  process.exit()
})
