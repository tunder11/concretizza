require("dotenv").config()
const express = require("express")
const path = require("path")
const fs = require("fs")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const { body, validationResult, param } = require("express-validator")
const cors = require("cors")
const rateLimit = require("express-rate-limit")
const db = require("./db")

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
app.use("/styles", express.static(path.join(__dirname, "src/styles")))
app.use(express.static(path.join(__dirname)))

// ===== MIDDLEWARE DE AUTENTICAÇÃO JWT =====
function autenticar(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1]
  
  if (!token) {
    console.log(`[${getDataSaoPaulo()}] [AUTH] Token não fornecido`)
    return res.status(401).json({ error: "Token não fornecido" })
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    console.log(`[${getDataSaoPaulo()}] [AUTH] Token verificado:`, decoded)
    req.usuario = decoded
    next()
  } catch (err) {
    console.log(`[${getDataSaoPaulo()}] [AUTH] Token inválido:`, err.message)
    return res.status(401).json({ error: "Token inválido ou expirado" })
  }
}

// ===== MIDDLEWARE DE AUTORIZAÇÃO =====
function autorizar(...cargos) {
  return (req, res, next) => {
    console.log(`[${getDataSaoPaulo()}] [AUTORIZAR] Verificando cargo "${req.usuario.cargo}" contra [${cargos.join(", ")}]`)
    if (!cargos.includes(req.usuario.cargo)) {
      console.log(`[${getDataSaoPaulo()}] [AUTORIZAR] Permissão negada para cargo "${req.usuario.cargo}"`)
      return res.status(403).json({ error: "Permissão negada" })
    }
    console.log(`[${getDataSaoPaulo()}] [AUTORIZAR] Permissão concedida para cargo "${req.usuario.cargo}"`)
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

const pool = db.pool

function dbQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (db.isPostgres && pool) {
      pool.query(sql, params, (err, result) => {
        if (err) reject(err)
        else resolve(result)
      })
    } else {
      db.query(sql, params).then(resolve).catch(reject)
    }
  })
}

function getDataSaoPaulo() {
  return new Date().toLocaleString('pt-BR', { 
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

// ===== CRIAR TABELAS =====
async function initializeTables() {
  try {
    await dbQuery(`
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
    console.log(`[${getDataSaoPaulo()}] ✓ Tabela usuarios criada`)

    await dbQuery(`
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
    console.log(`[${getDataSaoPaulo()}] ✓ Tabela clientes criada`)

    await dbQuery(`
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
    console.log(`[${getDataSaoPaulo()}] ✓ Tabela agendamentos criada`)

    await dbQuery(`
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
      await dbQuery("ALTER TABLE logs_auditoria ADD COLUMN usuario_afetado TEXT")
    } catch (e) {
      if (!e.message?.includes("already exists") && !e.message?.includes("duplicate column")) {
        console.log(`[${getDataSaoPaulo()}] Nota: Coluna usuario_afetado já existe ou erro ao adicionar:`, e.message)
      }
    }

    console.log(`[${getDataSaoPaulo()}] ✓ Tabela logs_auditoria criada/verificada`)

    try {
      await dbQuery("ALTER TABLE clientes ADD COLUMN atribuido_a INTEGER REFERENCES usuarios(id)")
    } catch (e) {
      if (!e.message?.includes("already exists") && !e.message?.includes("duplicate column")) {
        console.log(`[${getDataSaoPaulo()}] Nota: Coluna atribuido_a já existe ou erro ao adicionar:`, e.message)
      }
    }
  } catch (error) {
    console.error(`[${getDataSaoPaulo()}] Erro ao criar tabelas:`, error.message)
  }
}

// ===== FUNÇÃO DE LOG =====
async function registrarLog(usuarioId, acao, modulo, descricao, usuarioAfetado = null, req = null) {
  try {
    const ip = req ? (req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for']?.split(',')[0]?.trim()) : null
    
    await dbQuery(
      "INSERT INTO logs_auditoria (usuario_id, acao, modulo, descricao, usuario_afetado, ip_address) VALUES ($1, $2, $3, $4, $5, $6)",
      [usuarioId, acao, modulo, descricao, usuarioAfetado, ip]
    )
    
    console.log(`[LOG] ${getDataSaoPaulo()} - ${acao} - ${modulo}: ${descricao}`)
  } catch (err) {
    console.error(`[LOG] ${getDataSaoPaulo()} - Erro ao registrar log:`, err.message)
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
    const result = await dbQuery("SELECT COUNT(*) as count FROM usuarios")
    const count = parseInt(result.rows[0].count)

    if (count === 0) {
      console.log(`[${getDataSaoPaulo()}] 📝 Criando usuários padrão...`)
      for (const usuario of usuariosPadrao) {
        const senhaHash = await bcrypt.hash(usuario.password, BCRYPT_ROUNDS)
        try {
          await dbQuery(
            `INSERT INTO usuarios (nome, email, username, senha, permissao, status)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [usuario.nome, usuario.email, usuario.username, senhaHash, usuario.permissao, "ativo"]
          )
        } catch (e) {
          if (!e.message.includes("UNIQUE")) throw e
        }
        console.log(`[${getDataSaoPaulo()}]   ✓ ${usuario.username}`)
      }
      console.log(`[${getDataSaoPaulo()}] ✓ Usuários padrão criados com sucesso!`)
    }
  } catch (error) {
    console.error(`[${getDataSaoPaulo()}] ❌ Erro ao criar usuários padrão:`, error.message)
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
    console.log(`[${getDataSaoPaulo()}] [LOGIN] Tentativa de login para usuário: ${username}`)
    
    db.get(
      "SELECT id, nome, email, username, senha, permissao FROM usuarios WHERE (username = $1 OR email = $2) AND status = $3",
      [username, username, "ativo"],
      (err, user) => {
        if (err) {
          console.log(`[${getDataSaoPaulo()}] [LOGIN] Erro ao buscar usuário:`, err)
          return res.status(500).json({ error: "Erro no servidor" })
        }
        
        if (!user) {
          console.log(`[${getDataSaoPaulo()}] [LOGIN] Usuário não encontrado: ${username}`)
          return res.status(401).json({ error: "Usuário ou senha incorretos" })
        }

        console.log(`[${getDataSaoPaulo()}] [LOGIN] Usuário encontrado: ${user.username}, permissao: ${user.permissao}`)

        bcrypt.compare(password, user.senha, (err, isValid) => {
          if (err) {
            console.log(`[${getDataSaoPaulo()}] [LOGIN] Erro ao comparar senha:`, err)
            return res.status(500).json({ error: "Erro no servidor" })
          }
          
          if (!isValid) {
            console.log(`[${getDataSaoPaulo()}] [LOGIN] Senha inválida para ${username}`)
            return res.status(401).json({ error: "Usuário ou senha incorretos" })
          }

          console.log(`[${getDataSaoPaulo()}] [LOGIN] Autenticação bem-sucedida para ${username}`)
          const token = jwt.sign(
            { id: user.id, username: user.username, cargo: user.permissao },
            JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRE || "24h" }
          )

          console.log(`[${getDataSaoPaulo()}] [LOGIN] Token gerado para ${username}, cargo: ${user.permissao}`)

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
  const isCorretor = req.usuario.cargo?.toLowerCase() === "corretor"
  const usuarioId = req.usuario.id
  
  let query = "SELECT c.id, c.nome, c.telefone, c.email, c.interesse, c.valor, c.status, c.observacoes, c.data, c.usuario_id, u.nome as cadastrado_por, c.atribuido_a, ua.nome as atribuido_a_nome FROM clientes c LEFT JOIN usuarios u ON c.usuario_id = u.id LEFT JOIN usuarios ua ON c.atribuido_a = ua.id"
  let params = []
  
  if (isCorretor) {
    query += " WHERE c.usuario_id = $1 OR c.atribuido_a = $2"
    params = [usuarioId, usuarioId]
  }
  
  query += " ORDER BY c.data DESC"
  
  db.all(query, params, (err, rows) => {
    if (err) {
      console.error("[CLIENTES GET] Erro ao buscar clientes:", err)
      return res.status(500).json({ error: "Erro ao buscar clientes" })
    }
    res.json(rows || [])
  })
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
    const usuarioResponsavel = req.usuario.id
    const dataCliente = data || new Date().toISOString().split("T")[0]
    
    console.log(`[${getDataSaoPaulo()}] [CLIENTES] Criando novo cliente:`, { nome, telefone, email, interesse, valor, status, observacoes, data: dataCliente, usuarioResponsavel })
    
    try {
      const result = await dbQuery(
        "INSERT INTO clientes (nome, telefone, email, interesse, valor, status, observacoes, data, usuario_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id",
        [nome, telefone, email || null, interesse, valor || null, status, observacoes || null, dataCliente, usuarioResponsavel]
      )
      const clienteId = result.rows[0]?.id
      console.log(`[${getDataSaoPaulo()}] [CLIENTES] Cliente criado com sucesso, ID:`, clienteId)
      await registrarLog(req.usuario.id, "CRIAR", "Clientes", `Cliente criado: ${nome}`, nome, req)
      res.status(201).json({ id: clienteId, message: "Cliente criado com sucesso" })
    } catch (err) {
      console.error(`[${getDataSaoPaulo()}] [CLIENTES] Erro ao inserir cliente:`, err)
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
    const isCorretor = req.usuario.cargo?.toLowerCase() === "corretor"
    
    try {
      if (isCorretor) {
        const cliente = await dbQuery("SELECT usuario_id FROM clientes WHERE id = $1", [id])
        if (cliente.rows.length === 0) {
          return res.status(404).json({ error: "Cliente não encontrado" })
        }
        if (cliente.rows[0].usuario_id !== req.usuario.id) {
          console.log(`[${getDataSaoPaulo()}] [CLIENTES PUT] Corretor tentou editar cliente de outro usuário`)
          return res.status(403).json({ error: "Você não tem permissão para editar este cliente" })
        }
      }
      
      const result = await dbQuery(
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
    const isCorretor = req.usuario.cargo?.toLowerCase() === "corretor"
    
    try {
      const clienteResult = await dbQuery("SELECT nome, usuario_id FROM clientes WHERE id = $1", [id])
      const cliente = clienteResult.rows[0]
      
      if (!cliente) {
        return res.status(404).json({ error: "Cliente não encontrado" })
      }
      
      if (isCorretor && cliente.usuario_id !== req.usuario.id) {
        console.log(`[${getDataSaoPaulo()}] [CLIENTES DELETE] Corretor tentou deletar cliente de outro usuário`)
        return res.status(403).json({ error: "Você não tem permissão para deletar este cliente" })
      }
      
      const clienteNome = cliente?.nome || id
      
      const deleteResult = await dbQuery("DELETE FROM clientes WHERE id = $1", [id])
      
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

app.post(
  "/api/clientes/:id/atribuir",
  autenticar,
  autorizar("admin", "head-admin"),
  [
    param("id").isInt().withMessage("ID inválido"),
    body("atribuido_a").optional({ checkFalsy: true }).isInt().withMessage("ID do usuário inválido")
  ],
  validarRequisicao,
  async (req, res) => {
    const { id } = req.params
    const { atribuido_a } = req.body

    try {
      const cliente = await dbQuery("SELECT nome FROM clientes WHERE id = $1", [parseInt(id)])
      if (cliente.rows.length === 0) {
        return res.status(404).json({ error: "Cliente não encontrado" })
      }

      if (atribuido_a) {
        const usuario = await dbQuery("SELECT id, nome FROM usuarios WHERE id = $1", [parseInt(atribuido_a)])
        if (usuario.rows.length === 0) {
          return res.status(404).json({ error: "Usuário não encontrado" })
        }
      }

      await dbQuery(
        "UPDATE clientes SET atribuido_a = $1, atualizado_em = CURRENT_TIMESTAMP WHERE id = $2",
        [atribuido_a ? parseInt(atribuido_a) : null, parseInt(id)]
      )

      const nomeAtribuido = atribuido_a ? (await dbQuery("SELECT nome FROM usuarios WHERE id = $1", [parseInt(atribuido_a)])).rows[0]?.nome : "Ninguém"
      await registrarLog(req.usuario.id, "ATRIBUIR", "Clientes", `Cliente "${cliente.rows[0].nome}" atribuído a "${nomeAtribuido}"`, cliente.rows[0].nome, req)
      res.json({ success: true, message: "Cliente atribuído com sucesso" })
    } catch (error) {
      console.error("[CLIENTES ATRIBUIR] Erro ao atribuir cliente:", error)
      res.status(500).json({ error: "Erro ao atribuir cliente: " + error.message })
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

      const result = await dbQuery(
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
      const userResult = await dbQuery("SELECT permissao, nome as nome_atual FROM usuarios WHERE id = $1", [usuarioIdSendoEditado])
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
        result = await dbQuery(
          "UPDATE usuarios SET nome = $1, email = $2, senha = $3, permissao = $4, status = $5, telefone = $6, departamento = $7, atualizado_em = CURRENT_TIMESTAMP WHERE id = $8",
          [nome, email, senhaHash, permissao.toLowerCase(), status, telefone, departamento, id]
        )
      } else {
        result = await dbQuery(
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

    console.log(`[${getDataSaoPaulo()}] [DELETE USUARIO] Tentativa de deletar usuário ${usuarioId} por ${usuarioAtual.cargo} (ID: ${usuarioAtual.id})`)

    if (usuarioId === usuarioAtual.id) {
      console.log(`[${getDataSaoPaulo()}] [DELETE USUARIO] Erro: tentativa de deletar a própria conta`)
      return res.status(400).json({ error: "Você não pode deletar sua própria conta" })
    }

    let client = null
    try {
      // Verificar usuário alvo e permissões
      const userResult = await dbQuery("SELECT permissao, nome FROM usuarios WHERE id = $1", [usuarioId])
      const usuarioAlvo = userResult.rows[0]

      if (!usuarioAlvo) {
        console.log(`[${getDataSaoPaulo()}] [DELETE USUARIO] Usuário não encontrado`)
        return res.status(404).json({ error: "Usuário não encontrado" })
      }

      const cargoUsuarioLogado = usuarioAtual.cargo?.toLowerCase()
      const cargoUsuarioAlvo = usuarioAlvo.permissao?.toLowerCase()

      if (cargoUsuarioLogado === "admin" && (cargoUsuarioAlvo === "admin" || cargoUsuarioAlvo === "head-admin")) {
        console.log(`[${getDataSaoPaulo()}] [DELETE USUARIO] Erro: Admin tentou deletar usuário com cargo igual ou superior`)
        return res.status(403).json({ error: "Admin não pode deletar usuários com cargo igual ou superior" })
      }

      // Para PostgreSQL, usar transações; para SQLite, executar sequencialmente
      if (db.isPostgres) {
        client = await pool.connect()
        await client.query('BEGIN')

        // 1. Remover agendamentos do usuário
        await client.query("DELETE FROM agendamentos WHERE usuario_id = $1", [usuarioId])

        // 2. Desvincular clientes (setar usuario_id = NULL e atribuido_a = NULL)
        await client.query("UPDATE clientes SET usuario_id = NULL WHERE usuario_id = $1", [usuarioId])
        await client.query("UPDATE clientes SET atribuido_a = NULL WHERE atribuido_a = $1", [usuarioId])

        // 3. Desvincular logs de auditoria
        await client.query("UPDATE logs_auditoria SET usuario_id = NULL WHERE usuario_id = $1", [usuarioId])

        // 4. Deletar o usuário
        const deleteResult = await client.query("DELETE FROM usuarios WHERE id = $1", [usuarioId])

        if (deleteResult.rowCount === 0) {
          await client.query('ROLLBACK')
          return res.status(404).json({ error: "Usuário não encontrado durante a exclusão" })
        }

        await client.query('COMMIT')
      } else {
        // SQLite: executar operações sequencialmente
        // 1. Remover agendamentos do usuário
        await dbQuery("DELETE FROM agendamentos WHERE usuario_id = $1", [usuarioId])

        // 2. Desvincular clientes (setar usuario_id = NULL e atribuido_a = NULL)
        await dbQuery("UPDATE clientes SET usuario_id = NULL WHERE usuario_id = $1", [usuarioId])
        await dbQuery("UPDATE clientes SET atribuido_a = NULL WHERE atribuido_a = $1", [usuarioId])

        // 3. Desvincular logs de auditoria
        await dbQuery("UPDATE logs_auditoria SET usuario_id = NULL WHERE usuario_id = $1", [usuarioId])

        // 4. Deletar o usuário
        const deleteResult = await dbQuery("DELETE FROM usuarios WHERE id = $1", [usuarioId])

        if (deleteResult.rowCount === 0) {
          return res.status(404).json({ error: "Usuário não encontrado durante a exclusão" })
        }
      }
      
      console.log(`[${getDataSaoPaulo()}] [DELETE USUARIO] Usuário e dados relacionados processados com sucesso`)
      await registrarLog(req.usuario.id, "DELETAR", "Usuários", `Usuário deletado: ${usuarioId}`, usuarioAlvo?.nome || usuarioId, req)
      res.json({ success: true, message: "Usuário deletado com sucesso" })

    } catch (err) {
      if (client && db.isPostgres) {
        try {
          await client.query('ROLLBACK')
        } catch (e) {
          console.error("[DELETE USUARIO] Erro ao fazer ROLLBACK:", e)
        }
      }
      console.error("[DELETE USUARIO] Erro ao deletar:", err)
      res.status(500).json({ error: "Erro ao deletar usuário: " + err.message })
    } finally {
      if (client) {
        client.release()
      }
    }
  }
)

// ===== ROTAS DE LOGS =====
app.get("/api/logs", autenticar, autorizar("head-admin", "admin"), async (req, res) => {
  try {
    const result = await dbQuery(
      `SELECT l.*, u.nome as usuario_nome, u.username as usuario_username 
       FROM logs_auditoria l 
       LEFT JOIN usuarios u ON l.usuario_id = u.id 
       ORDER BY l.criado_em DESC`
    )
    
    const logsFormatados = result.rows.map(log => {
      const data = new Date(log.criado_em)
      
      const formatter = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      })
      
      const partes = formatter.formatToParts(data)
      const dia = partes.find(p => p.type === 'day')?.value
      const mes = partes.find(p => p.type === 'month')?.value
      const ano = partes.find(p => p.type === 'year')?.value
      const hora = partes.find(p => p.type === 'hour')?.value
      const minuto = partes.find(p => p.type === 'minute')?.value
      const segundo = partes.find(p => p.type === 'second')?.value
      
      return {
        id: log.id,
        acao: log.acao,
        modulo: log.modulo,
        descricao: log.descricao,
        usuarioLogado: log.usuario_nome || log.usuario_username || "Sistema/Deletado",
        usuarioAfetado: log.usuario_afetado,
        dataFormatada: `${dia}/${mes}/${ano}`,
        horaFormatada: `${hora}:${minuto}:${segundo}`,
        ip: log.ip_address,
        criado_em: log.criado_em
      }
    })
    
    res.json(logsFormatados)
  } catch (err) {
    console.error(`[${getDataSaoPaulo()}] [LOGS] Erro ao buscar logs:`, err)
    res.status(500).json({ error: "Erro ao buscar logs: " + err.message })
  }
})

// ===== ROTAS DE CORRETORES (APENAS PARA ADMINS) =====
app.get(
  "/api/corretores",
  autenticar,
  autorizar("head-admin", "admin"),
  async (req, res) => {
    try {
      const corretores = await dbQuery(
        `SELECT u.id, u.nome, u.email, u.telefone, u.departamento, u.status, COUNT(c.id) as total_clientes
         FROM usuarios u
         LEFT JOIN clientes c ON u.id = c.usuario_id
         WHERE u.permissao = 'corretor'
         GROUP BY u.id, u.nome, u.email, u.telefone, u.departamento, u.status
         ORDER BY u.nome`
      )
      
      res.json(corretores.rows || [])
    } catch (err) {
      console.error(`[${getDataSaoPaulo()}] [CORRETORES] Erro ao buscar corretores:`, err)
      res.status(500).json({ error: "Erro ao buscar corretores: " + err.message })
    }
  }
)

app.get(
  "/api/corretores/:id/clientes",
  autenticar,
  autorizar("head-admin", "admin"),
  async (req, res) => {
    try {
      const { id } = req.params
      
      const resultado = await dbQuery(
        `SELECT c.id, c.nome, c.telefone, c.email, c.interesse, c.valor, c.status, c.observacoes, c.data
         FROM clientes c
         WHERE c.atribuido_a = $1
         ORDER BY c.nome`,
        [parseInt(id)]
      )
      
      res.json(resultado.rows || [])
    } catch (err) {
      console.error(`[${getDataSaoPaulo()}] [CORRETORES] Erro ao buscar clientes do corretor:`, err)
      res.status(500).json({ error: "Erro ao buscar clientes do corretor: " + err.message })
    }
  }
)

app.post(
  "/api/corretores/:corretor_id/clientes/:cliente_id",
  autenticar,
  autorizar("head-admin", "admin"),
  async (req, res) => {
    try {
      const { corretor_id, cliente_id } = req.params
      
      const clienteVerify = await dbQuery(
        `SELECT atribuido_a FROM clientes WHERE id = $1`,
        [cliente_id]
      )
      
      if (clienteVerify.rowCount === 0) {
        return res.status(404).json({ error: "Cliente não encontrado" })
      }
      
      if (clienteVerify.rows[0].atribuido_a === parseInt(corretor_id)) {
        return res.status(400).json({ error: "Este cliente já está atribuído a este corretor" })
      }
      
      const resultado = await dbQuery(
        `UPDATE clientes SET atribuido_a = $1, atualizado_em = CURRENT_TIMESTAMP WHERE id = $2`,
        [parseInt(corretor_id), parseInt(cliente_id)]
      )
      
      await dbQuery(
        `INSERT INTO logs_auditoria (usuario_id, acao, modulo, descricao) VALUES ($1, $2, $3, $4)`,
        [req.usuario.id, "ATRIBUIR_CLIENTE", "CORRETORES", `Cliente ${cliente_id} atribuído ao corretor ${corretor_id}`]
      )
      
      console.log(`[${getDataSaoPaulo()}] [CORRETORES] Cliente ${cliente_id} atribuído ao corretor ${corretor_id} por ${req.usuario.username}`)
      res.json({ message: "Cliente atribuído com sucesso" })
    } catch (err) {
      console.error(`[${getDataSaoPaulo()}] [CORRETORES] Erro ao atribuir cliente:`, err)
      res.status(500).json({ error: "Erro ao atribuir cliente: " + err.message })
    }
  }
)

app.delete(
  "/api/corretores/:corretor_id/clientes/:cliente_id",
  autenticar,
  autorizar("head-admin", "admin"),
  async (req, res) => {
    try {
      const { corretor_id, cliente_id } = req.params
      
      const resultado = await dbQuery(
        `UPDATE clientes SET atribuido_a = NULL, atualizado_em = CURRENT_TIMESTAMP WHERE id = $1 AND atribuido_a = $2`,
        [parseInt(cliente_id), parseInt(corretor_id)]
      )
      
      if (resultado.rowCount === 0) {
        return res.status(404).json({ error: "Cliente ou vínculo não encontrado" })
      }
      
      await dbQuery(
        `INSERT INTO logs_auditoria (usuario_id, acao, modulo, descricao) VALUES ($1, $2, $3, $4)`,
        [req.usuario.id, "REMOVER_CLIENTE", "CORRETORES", `Cliente ${cliente_id} removido do corretor ${corretor_id}`]
      )
      
      console.log(`[${getDataSaoPaulo()}] [CORRETORES] Cliente ${cliente_id} removido do corretor ${corretor_id} por ${req.usuario.username}`)
      res.json({ message: "Cliente removido com sucesso" })
    } catch (err) {
      console.error(`[${getDataSaoPaulo()}] [CORRETORES] Erro ao remover cliente:`, err)
      res.status(500).json({ error: "Erro ao remover cliente: " + err.message })
    }
  }
)

app.get(
  "/api/clientes-disponiveis",
  autenticar,
  autorizar("head-admin", "admin"),
  async (req, res) => {
    try {
      const resultado = await dbQuery(
        `SELECT c.id, c.nome, c.telefone, c.email, c.interesse, c.valor, c.status, c.usuario_id, u.nome as cadastrado_por, c.atribuido_a, ua.nome as atribuido_a_nome
         FROM clientes c
         LEFT JOIN usuarios u ON c.usuario_id = u.id
         LEFT JOIN usuarios ua ON c.atribuido_a = ua.id
         ORDER BY c.nome`
      )
      
      res.json(resultado.rows || [])
    } catch (err) {
      console.error(`[${getDataSaoPaulo()}] [CLIENTES] Erro ao buscar clientes disponíveis:`, err)
      res.status(500).json({ error: "Erro ao buscar clientes: " + err.message })
    }
  }
)

app.delete("/api/logs", autenticar, autorizar("head-admin", "admin"), async (req, res) => {
  try {
    await dbQuery(`DELETE FROM logs_auditoria`)
    
    console.log(`[${getDataSaoPaulo()}] [LOGS] Todos os logs foram deletados pelo usuário:`, req.usuario.username)
    res.json({ message: "Logs deletados com sucesso" })
  } catch (err) {
    console.error(`[${getDataSaoPaulo()}] [LOGS] Erro ao deletar logs:`, err)
    res.status(500).json({ error: "Erro ao deletar logs: " + err.message })
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
  console.error(`[${getDataSaoPaulo()}] Erro interno:`, err)
  res.status(500).json({ error: "Erro interno do servidor" })
})

app.use((req, res) => {
  res.status(404).json({ error: "Rota não encontrada" })
})

// ===== INICIAR SERVIDOR =====
app.listen(PORT, () => {
  console.log(`[${getDataSaoPaulo()}] Servidor Concretizza rodando na porta ${PORT}`)
  console.log(`[${getDataSaoPaulo()}] Ambiente: ${process.env.NODE_ENV || "development"}`)
})

process.on("SIGINT", () => {
  pool.end()
  process.exit()
})
