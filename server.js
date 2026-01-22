require("dotenv").config()
const express = require("express")
const http = require("http")
const { Server } = require("socket.io")
const path = require("path")
const fs = require("fs")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const { body, validationResult, param } = require("express-validator")
const cors = require("cors")
const rateLimit = require("express-rate-limit")
const db = require("./src/config/db")

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

app.use(express.static(path.join(__dirname, "public")))
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
    console.log(`[${getDataSaoPaulo()}] [AUTH] Token verificado - ID: ${decoded.id}, Username: ${decoded.username}, Cargo: "${decoded.cargo}"`)
    req.usuario = decoded
    next()
  } catch (err) {
    console.error(`[${getDataSaoPaulo()}] [AUTH] Token inválido: ${err.message}, Token: ${token?.substring(0, 50)}...`)
    return res.status(401).json({ error: "Token inválido ou expirado" })
  }
}

// ===== MIDDLEWARE DE AUTORIZAÇÃO =====
function autorizar(...cargosPermitidos) {
  return (req, res, next) => {
    const cargosUsuario = req.usuario.cargo ? req.usuario.cargo.toLowerCase().split(',').map(c => c.trim()) : [];
    console.log(`[${getDataSaoPaulo()}] [AUTORIZAR] Verificando cargos "${cargosUsuario.join(", ")}" contra [${cargosPermitidos.join(", ")}]`)
    
    const temPermissao = cargosUsuario.some(cargo => cargosPermitidos.includes(cargo));

    if (!temPermissao) {
      console.log(`[${getDataSaoPaulo()}] [AUTORIZAR] Permissão negada para cargos "${cargosUsuario.join(", ")}"`)
      return res.status(403).json({ error: "Permissão negada" })
    }
    console.log(`[${getDataSaoPaulo()}] [AUTORIZAR] Permissão concedida para cargos "${cargosUsuario.join(", ")}"`)
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
      // For PostgreSQL, add RETURNING id to INSERT queries that don't have it
      let modifiedSql = sql
      if (sql.trim().toUpperCase().startsWith('INSERT') && !sql.toUpperCase().includes('RETURNING')) {
        modifiedSql = sql + ' RETURNING id'
      }
      pool.query(modifiedSql, params, (err, result) => {
        if (err) reject(err)
        else resolve(result)
      })
    } else {
      if (sql.trim().toUpperCase().startsWith('SELECT')) {
        db.all(sql, params, (err, rows) => {
          if (err) reject(err)
          else resolve({ rows })
        })
      } else {
        db.run(sql, params, (err, result) => {
          if (err) reject(err)
          else resolve(result)
        })
      }
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

function getDataSaoPauloDate(dateString) {
  if (!dateString) return null

  // Se já estiver no formato YYYY-MM-DD, retornar como está
  if (typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return dateString
  }

  // Se for uma string de data/hora já formatada em pt-BR, extrair apenas a data
  if (typeof dateString === 'string' && /^\d{2}\/\d{2}\/\d{4}/.test(dateString)) {
    const [datePart] = dateString.split(',')
    const [day, month, year] = datePart.split('/')
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  try {
    const date = new Date(dateString)
    if (isNaN(date.getTime())) {
      console.error('Data inválida para getDataSaoPauloDate:', dateString)
      return null
    }

    const formatter = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
    const parts = formatter.formatToParts(date)
    const day = parts.find(p => p.type === 'day')?.value
    const month = parts.find(p => p.type === 'month')?.value
    const year = parts.find(p => p.type === 'year')?.value
    return `${year}-${month}-${day}`
  } catch (error) {
    console.error('Erro ao processar data em getDataSaoPauloDate:', dateString, error)
    return null
  }
}

// ===== FUNÇÃO PARA DETECTAR DUPLICATAS DE CLIENTES =====
async function detectarDuplicatasCliente(nome, telefone, email = null) {
  try {
    // Normalizar telefone para comparação (apenas números)
    const telefoneNormalizado = telefone?.trim().replace(/[^\d]/g, '')

    console.log(`[${getDataSaoPaulo()}] [DUPLICATAS] Verificando duplicatas para telefone: "${telefone}" -> normalizado: "${telefoneNormalizado}"`)

    // Buscar apenas por telefone exato (único critério de duplicata)
    if (telefoneNormalizado && telefoneNormalizado.length >= 7) {
      // Usar uma abordagem simplificada: buscar todos os clientes e filtrar
    const result = await dbQuery("SELECT id, nome, telefone, email, status, interesse, valor, observacoes FROM clientes", [])

    console.log(`[${getDataSaoPaulo()}] [DUPLICATAS] Buscou ${result.rows.length} clientes do banco para verificar "${telefone}" -> "${telefoneNormalizado}"`)

    // Filtrar no JavaScript após buscar todos os registros
    const duplicatas = result.rows.filter(cliente => {
      const telefoneClienteNormalizado = cliente.telefone?.trim().replace(/[^\d]/g, '')
      const isDuplicata = telefoneClienteNormalizado === telefoneNormalizado
      if (isDuplicata) {
        console.log(`[${getDataSaoPaulo()}] [DUPLICATAS] DUPLICATA ENCONTRADA: Cliente "${cliente.nome}" (ID: ${cliente.id}) - "${cliente.telefone}" normaliza para "${telefoneClienteNormalizado}"`)
      }
      return isDuplicata
    })

    console.log(`[${getDataSaoPaulo()}] [DUPLICATAS] Total de duplicatas encontradas: ${duplicatas.length}`)
    return duplicatas
    }

    return []
  } catch (error) {
    console.error(`[${getDataSaoPaulo()}] [DUPLICATAS] Erro ao detectar duplicatas:`, error)
    return []
  }
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
      CREATE TABLE IF NOT EXISTS captacoes (
        id SERIAL PRIMARY KEY,
        titulo TEXT NOT NULL,
        regiao TEXT NOT NULL,
        valor_estimado TEXT,
        objetivo TEXT,
        prioridade TEXT DEFAULT 'media',
        observacoes TEXT,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    console.log(`[${getDataSaoPaulo()}] ✓ Tabela captacoes criada`)

    // Garantir que todas as colunas existam (migrações)
    try {
      // Verificar se as colunas existem antes de tentar criar
      if (db.isPostgres) {
        const columnsResult = await dbQuery(`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_name = 'clientes' AND column_name IN ('primeiro_contato', 'ultimo_contato')
        `)
        const existingColumns = columnsResult.rows.map(row => row.column_name)

        if (!existingColumns.includes('primeiro_contato')) {
          await dbQuery("ALTER TABLE clientes ADD COLUMN primeiro_contato TEXT")
          console.log(`[${getDataSaoPaulo()}] ✓ Coluna primeiro_contato criada`)
        } else {
          console.log(`[${getDataSaoPaulo()}] ✓ Coluna primeiro_contato já existe`)
        }

        if (!existingColumns.includes('ultimo_contato')) {
          await dbQuery("ALTER TABLE clientes ADD COLUMN ultimo_contato TEXT")
          console.log(`[${getDataSaoPaulo()}] ✓ Coluna ultimo_contato criada`)
        } else {
          console.log(`[${getDataSaoPaulo()}] ✓ Coluna ultimo_contato já existe`)
        }
      } else {
        // SQLite
        try {
          await dbQuery("ALTER TABLE clientes ADD COLUMN primeiro_contato TEXT")
          console.log(`[${getDataSaoPaulo()}] ✓ Coluna primeiro_contato criada`)
        } catch (e) {
          if (e.message?.includes("duplicate column")) {
            console.log(`[${getDataSaoPaulo()}] ✓ Coluna primeiro_contato já existe`)
          }
        }

        try {
          await dbQuery("ALTER TABLE clientes ADD COLUMN ultimo_contato TEXT")
          console.log(`[${getDataSaoPaulo()}] ✓ Coluna ultimo_contato criada`)
        } catch (e) {
          if (e.message?.includes("duplicate column")) {
            console.log(`[${getDataSaoPaulo()}] ✓ Coluna ultimo_contato já existe`)
          }
        }
      }

      // Migração adicional: Verificar se há dados de contato existentes que precisam ser preservados
      console.log(`[${getDataSaoPaulo()}] Verificando preservação de dados de contato existentes...`)
      const clientesComDados = await dbQuery("SELECT id, nome, primeiro_contato, ultimo_contato FROM clientes WHERE primeiro_contato IS NOT NULL OR ultimo_contato IS NOT NULL LIMIT 5")
      if (clientesComDados.rows && clientesComDados.rows.length > 0) {
        console.log(`[${getDataSaoPaulo()}] ✓ Encontrados ${clientesComDados.rows.length} clientes com dados de contato preservados`)
        clientesComDados.rows.forEach(cliente => {
          console.log(`[${getDataSaoPaulo()}]   - ${cliente.nome}: primeiro_contato=${cliente.primeiro_contato || 'NULL'}, ultimo_contato=${cliente.ultimo_contato || 'NULL'}`)
        })
      } else {
        console.log(`[${getDataSaoPaulo()}] ✓ Nenhum dado de contato existente encontrado (normal para bancos novos)`)
      }
    } catch (e) {
      console.log(`[${getDataSaoPaulo()}] Nota: Erro na migração das colunas de contato:`, e.message)
    }

    // Adicionar colunas de contato para usuários (apenas admins e head-admins)
    try {
      await dbQuery("ALTER TABLE usuarios ADD COLUMN primeiro_contato TEXT")
    } catch (e) {
      if (!e.message?.includes("already exists") && !e.message?.includes("duplicate column")) {
        console.log(`[${getDataSaoPaulo()}] Nota: Coluna primeiro_contato já existe na tabela usuarios ou erro ao adicionar:`, e.message)
      }
    }

    try {
      await dbQuery("ALTER TABLE usuarios ADD COLUMN ultimo_contato TEXT")
    } catch (e) {
      if (!e.message?.includes("already exists") && !e.message?.includes("duplicate column")) {
        console.log(`[${getDataSaoPaulo()}] Nota: Coluna ultimo_contato já existe na tabela usuarios ou erro ao adicionar:`, e.message)
      }
    }

    try {
      await dbQuery("ALTER TABLE captacoes ADD COLUMN objetivo TEXT")
    } catch (e) {
      if (!e.message?.includes("already exists") && !e.message?.includes("duplicate column")) {
        console.log(`[${getDataSaoPaulo()}] Nota: Coluna objetivo já existe ou erro ao adicionar:`, e.message)
      }
    }

    // Remover coluna endereco se existir (já que usamos regiao agora)
    try {
      await dbQuery("ALTER TABLE captacoes DROP COLUMN endereco")
      console.log(`[${getDataSaoPaulo()}] ✓ Coluna endereco removida da tabela captacoes`)
    } catch (e) {
      if (e.message?.includes("no such column")) {
        console.log(`[${getDataSaoPaulo()}] ✓ Coluna endereco já não existe`)
      } else if (!e.message?.includes("duplicate column")) {
        console.log(`[${getDataSaoPaulo()}] Nota: Erro ao remover coluna endereco:`, e.message)
      }
    }

    try {
      await dbQuery("ALTER TABLE captacoes ADD COLUMN prioridade TEXT DEFAULT 'media'")
    } catch (e) {
      if (!e.message?.includes("already exists") && !e.message?.includes("duplicate column")) {
        console.log(`[${getDataSaoPaulo()}] Nota: Coluna prioridade já existe ou erro ao adicionar:`, e.message)
      }
    }

    try {
      await dbQuery("ALTER TABLE captacoes ADD COLUMN observacoes TEXT")
    } catch (e) {
      if (!e.message?.includes("already exists") && !e.message?.includes("duplicate column")) {
        console.log(`[${getDataSaoPaulo()}] Nota: Coluna observacoes já existe ou erro ao adicionar:`, e.message)
      }
    }

    try {
      await dbQuery("ALTER TABLE captacoes ADD COLUMN usuario_id INTEGER REFERENCES usuarios(id)")
    } catch (e) {
      if (!e.message?.includes("already exists") && !e.message?.includes("duplicate column")) {
        console.log(`[${getDataSaoPaulo()}] Nota: Coluna usuario_id já existe ou erro ao adicionar:`, e.message)
      }
    }

    await dbQuery(`
      CREATE TABLE IF NOT EXISTS bug_reports (
        id SERIAL PRIMARY KEY,
        titulo TEXT NOT NULL,
        descricao TEXT NOT NULL,
        prioridade TEXT DEFAULT 'media',
        status TEXT DEFAULT 'aberto',
        categoria TEXT DEFAULT 'geral',
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    console.log(`[${getDataSaoPaulo()}] ✓ Tabela bug_reports criada`)

    await dbQuery(`
      CREATE TABLE IF NOT EXISTS corretor_links (
        id ${db.isPostgres ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${db.isPostgres ? '' : 'AUTOINCREMENT'},
        titulo TEXT NOT NULL,
        url TEXT NOT NULL,
        descricao TEXT,
        criado_por INTEGER NOT NULL REFERENCES usuarios(id),
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    console.log(`[${getDataSaoPaulo()}] ✓ Tabela corretor_links criada`)

    // Migration: Remove corretor_id column if it exists (from old schema)
    try {
      if (db.isPostgres) {
        await dbQuery("ALTER TABLE corretor_links DROP COLUMN IF EXISTS corretor_id")
      } else {
        // For SQLite, check if corretor_id column exists and remove it
        console.log(`[${getDataSaoPaulo()}] Verificando migração de corretor_links...`)

        // Check if we need to migrate by trying to select corretor_id
        try {
          await dbQuery("SELECT corretor_id FROM corretor_links LIMIT 1")
          console.log(`[${getDataSaoPaulo()}] Coluna corretor_id encontrada, executando migração...`)

          // For SQLite, we need to recreate the table without the column
          await dbQuery(`
            CREATE TABLE corretor_links_new (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              titulo TEXT NOT NULL,
              url TEXT NOT NULL,
              descricao TEXT,
              criado_por INTEGER NOT NULL REFERENCES usuarios(id),
              criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
          `)

          // Copy data from old table to new table
          await dbQuery(`
            INSERT INTO corretor_links_new (id, titulo, url, descricao, criado_por, criado_em, atualizado_em)
            SELECT id, titulo, url, descricao, criado_por, criado_em, atualizado_em FROM corretor_links
          `)

          // Migrate link_assignments: create assignments for existing links
          const existingLinksResult = await dbQuery("SELECT id, corretor_id FROM corretor_links WHERE corretor_id IS NOT NULL")
          const existingLinks = existingLinksResult.rows || existingLinksResult
          for (const link of existingLinks) {
            try {
              await dbQuery(
                "INSERT OR IGNORE INTO link_assignments (link_id, corretor_id) VALUES ($1, $2)",
                [link.id, link.corretor_id]
              )
            } catch (e) {
              // Ignore if assignment already exists
            }
          }

          // Replace old table with new table
          await dbQuery("DROP TABLE corretor_links")
          await dbQuery("ALTER TABLE corretor_links_new RENAME TO corretor_links")

          console.log(`[${getDataSaoPaulo()}] ✓ Migração de corretor_links concluída`)
        } catch (selectError) {
          // Column doesn't exist or table is empty, which is fine
          console.log(`[${getDataSaoPaulo()}] ✓ corretor_links já está na estrutura correta ou vazio`)
        }
      }
    } catch (e) {
      console.log(`[${getDataSaoPaulo()}] Nota: Erro na migração de corretor_links (pode ser normal se já executada):`, e.message)
    }

    await dbQuery(`
      CREATE TABLE IF NOT EXISTS link_assignments (
        id SERIAL PRIMARY KEY,
        link_id INTEGER NOT NULL REFERENCES corretor_links(id) ON DELETE CASCADE,
        corretor_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(link_id, corretor_id)
      )
    `)
    console.log(`[${getDataSaoPaulo()}] ✓ Tabela link_assignments criada`)

    await dbQuery(`
      CREATE TABLE IF NOT EXISTS bug_report_messages (
        id SERIAL PRIMARY KEY,
        bug_report_id INTEGER NOT NULL REFERENCES bug_reports(id) ON DELETE CASCADE,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
        mensagem TEXT NOT NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    console.log(`[${getDataSaoPaulo()}] ✓ Tabela bug_report_messages criada`)

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

    try {
      await dbQuery("ALTER TABLE clientes ADD COLUMN tags TEXT")
    } catch (e) {
      if (!e.message?.includes("already exists") && !e.message?.includes("duplicate column")) {
        console.log(`[${getDataSaoPaulo()}] Nota: Coluna tags já existe ou erro ao adicionar:`, e.message)
      }
    }

    try {
      await dbQuery("ALTER TABLE clientes ADD COLUMN data_atribuicao TEXT")
    } catch (e) {
      if (!e.message?.includes("already exists") && !e.message?.includes("duplicate column")) {
        console.log(`[${getDataSaoPaulo()}] Nota: Coluna data_atribuicao já existe ou erro ao adicionar:`, e.message)
      }
    }

    try {
      await dbQuery("ALTER TABLE clientes ADD COLUMN ultimo_contato TEXT")
    } catch (e) {
      if (!e.message?.includes("already exists") && !e.message?.includes("duplicate column")) {
        console.log(`[${getDataSaoPaulo()}] Nota: Coluna ultimo_contato já existe ou erro ao adicionar:`, e.message)
      }
    }

    try {
      await dbQuery("ALTER TABLE clientes ADD COLUMN primeiro_contato TEXT")
    } catch (e) {
      if (!e.message?.includes("already exists") && !e.message?.includes("duplicate column")) {
        console.log(`[${getDataSaoPaulo()}] Nota: Coluna primeiro_contato já existe ou erro ao adicionar:`, e.message)
      }
    }

    try {
      await dbQuery("ALTER TABLE agendamentos ADD COLUMN corretor_id INTEGER REFERENCES usuarios(id)")
    } catch (e) {
      if (!e.message?.includes("already exists") && !e.message?.includes("duplicate column")) {
        console.log(`[${getDataSaoPaulo()}] Nota: Coluna corretor_id já existe ou erro ao adicionar:`, e.message)
      }
    }

    // Migração: Popular data_atribuicao para clientes existentes que têm atribuido_a mas não têm data_atribuicao
    try {
      console.log(`[${getDataSaoPaulo()}] Verificando migração de data_atribuicao...`)
      const clientesParaMigrar = await dbQuery("SELECT id, nome, criado_em FROM clientes WHERE atribuido_a IS NOT NULL AND (data_atribuicao IS NULL OR data_atribuicao = '')")

      if (clientesParaMigrar.rows && clientesParaMigrar.rows.length > 0) {
        console.log(`[${getDataSaoPaulo()}] Migrando ${clientesParaMigrar.rows.length} clientes com data_atribuicao ausente...`)

        for (const cliente of clientesParaMigrar.rows) {
          // Se criado_em já está no formato correto (sem timezone UTC), extrair apenas a data
          let dataAtribuicao
          if (cliente.criado_em && typeof cliente.criado_em === 'string') {
            // Se é uma string de data/hora sem timezone, assumir que já está em São Paulo
            if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(cliente.criado_em)) {
              dataAtribuicao = cliente.criado_em.split(' ')[0] // Extrair apenas YYYY-MM-DD
            } else {
              // Caso contrário, usar a função de conversão
              dataAtribuicao = getDataSaoPauloDate(cliente.criado_em)
            }
          } else {
            dataAtribuicao = getDataSaoPauloDate(new Date().toISOString())
          }

          await dbQuery("UPDATE clientes SET data_atribuicao = $1 WHERE id = $2", [dataAtribuicao, cliente.id])
          console.log(`[${getDataSaoPaulo()}] ✓ Cliente ${cliente.nome} (ID: ${cliente.id}) - data_atribuicao definida como: ${dataAtribuicao}`)
        }

        console.log(`[${getDataSaoPaulo()}] ✓ Migração de data_atribuicao concluída com sucesso!`)
      } else {
        console.log(`[${getDataSaoPaulo()}] ✓ Nenhum cliente precisa de migração de data_atribuicao.`)
      }
    } catch (migrationError) {
      console.log(`[${getDataSaoPaulo()}] Nota: Erro na migração de data_atribuicao (pode ser normal se já executada):`, migrationError.message)
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

async function populateUltimoAcesso() {
  try {
    const result = await dbQuery("UPDATE usuarios SET ultimoAcesso = $1 WHERE ultimoAcesso IS NULL", [new Date().toISOString()])
    if (result.rowCount && result.rowCount > 0) {
      console.log(`[${getDataSaoPaulo()}] ✓ ${result.rowCount} usuário(s) teve ultimoAcesso preenchido`)
    }
  } catch (error) {
    console.log(`[${getDataSaoPaulo()}] Nota: Erro ao popular ultimoAcesso:`, error.message)
  }
}

setTimeout(() => populateUltimoAcesso(), 1000)

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
            `INSERT INTO usuarios (nome, email, username, senha, permissao, status, ultimoAcesso)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [usuario.nome, usuario.email, usuario.username, senhaHash, usuario.permissao, "ativo", new Date().toISOString()]
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

          const dataAcesso = new Date().toISOString()
          db.run("UPDATE usuarios SET ultimoAcesso = $1 WHERE id = $2", [dataAcesso, user.id], (err) => {
            if (err) {
              console.error(`[${getDataSaoPaulo()}] [LOGIN] Erro ao atualizar ultimoAcesso:`, err)
            } else {
              console.log(`[${getDataSaoPaulo()}] [LOGIN] ultimoAcesso atualizado para ${username}`)
            }
          })

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
        "INSERT INTO usuarios (nome, email, username, senha, permissao, status, ultimoAcesso) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [nome, email, username, senhaHash, "corretor", "ativo", new Date().toISOString()],
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

app.get("/api/clientes", autenticar, autorizar("admin", "head-admin", "corretor"), async (req, res) => {
  const cargos = req.usuario.cargo ? req.usuario.cargo.toLowerCase().split(',').map(c => c.trim()) : []
  const isCorretor = cargos.includes("corretor")
  const isAdmin = cargos.includes("admin") || cargos.includes("head-admin")
  const usuarioId = req.usuario.id

  let query = "SELECT c.id, c.nome, c.telefone, c.email, c.interesse, c.valor, c.status, c.observacoes, c.data, c.usuario_id, c.tags, c.data_atribuicao, c.ultimo_contato, c.primeiro_contato, u.nome as cadastrado_por, c.atribuido_a, ua.nome as atribuido_a_nome FROM clientes c LEFT JOIN usuarios u ON c.usuario_id = u.id LEFT JOIN usuarios ua ON c.atribuido_a = ua.id"
  let params = []

  if (isCorretor && !isAdmin) {
    query += " WHERE c.usuario_id = $1 OR c.atribuido_a = $2"
    params = [usuarioId, usuarioId]
  }

  query += " ORDER BY c.id DESC"

  try {
    const result = await dbQuery(query, params)
    let rows = result.rows || result || []
    res.json(rows || [])
  } catch (err) {
    console.error("[CLIENTES GET] Erro ao buscar clientes:", err)
    res.status(500).json({ error: "Erro ao buscar clientes: " + err.message })
  }
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
    const { nome, telefone, email, interesse, valor, status, observacoes, data, tags, force } = req.body
    const usuarioResponsavel = req.usuario.id
    const dataCliente = data || new Date().toISOString().split("T")[0]

    // Verificar se o usuário é apenas corretor (sem admin ou head-admin)
    const cargosUsuario = req.usuario.cargo ? req.usuario.cargo.toLowerCase().split(',').map(c => c.trim()) : []
    const isOnlyCorretor = cargosUsuario.includes("corretor") && !cargosUsuario.includes("admin") && !cargosUsuario.includes("head-admin")

    // Atribuir automaticamente o cliente apenas se for corretor (sem admin/head-admin)
    const atribuidoA = isOnlyCorretor ? usuarioResponsavel : null
    const dataAtribuicao = isOnlyCorretor ? new Date().toISOString().split("T")[0] : null

    console.log(`[${getDataSaoPaulo()}] [CLIENTES] Criando novo cliente:`, { nome, telefone, email, interesse, valor, status, observacoes, data: dataCliente, usuarioResponsavel, atribuidoA, dataAtribuicao, tags })

    try {
      // Verificar duplicatas antes de criar - implementação inline para debug
      console.log(`[${getDataSaoPaulo()}] [CLIENTES] Verificando duplicatas para telefone: "${telefone}"`)

      // Normalizar telefone para comparação (apenas números)
      const telefoneNormalizado = telefone?.trim().replace(/[^\d]/g, '')
      console.log(`[${getDataSaoPaulo()}] [CLIENTES] Telefone normalizado: "${telefoneNormalizado}"`)

      // Buscar todos os clientes e filtrar no JavaScript
      const result = await dbQuery("SELECT id, nome, telefone FROM clientes", [])
      console.log(`[${getDataSaoPaulo()}] [CLIENTES] Buscou ${result.rows.length} clientes do banco`)

      // Filtrar duplicatas
      const duplicatas = result.rows.filter(cliente => {
        const telefoneClienteNormalizado = cliente.telefone?.trim().replace(/[^\d]/g, '')
        const isDuplicata = telefoneClienteNormalizado === telefoneNormalizado
        console.log(`[${getDataSaoPaulo()}] [CLIENTES] Comparando "${telefoneClienteNormalizado}" == "${telefoneNormalizado}" ? ${isDuplicata}`)
        return isDuplicata
      })

      console.log(`[${getDataSaoPaulo()}] [CLIENTES] Total de duplicatas encontradas: ${duplicatas.length}`)

      if (duplicatas && duplicatas.length > 0) {
        console.log(`[${getDataSaoPaulo()}] [DUPLICATAS] Possíveis duplicatas encontradas para "${nome}":`, duplicatas.length)
        console.log(`[${getDataSaoPaulo()}] [DUPLICATAS] Duplicatas:`, duplicatas.map(d => ({ id: d.id, nome: d.nome, telefone: d.telefone })))

        return res.status(409).json({
          error: "Cliente duplicado",
          message: "Já existe um cliente cadastrado com este número de telefone. Não é permitido cadastrar clientes duplicados.",
          duplicatas: duplicatas.slice(0, 5), // Limitar a 5 resultados
          allowForce: false
        })
      }

      console.log(`[${getDataSaoPaulo()}] [CLIENTES] Nenhuma duplicata encontrada, prosseguindo com criação...`)

      const insertResult = await dbQuery(
        "INSERT INTO clientes (nome, telefone, email, interesse, valor, status, observacoes, data, usuario_id, atribuido_a, data_atribuicao, tags) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
        [nome, telefone, email || null, interesse, valor || null, status, observacoes || null, dataCliente, usuarioResponsavel, atribuidoA, dataAtribuicao, tags || null]
      )
      const clienteId = result.rows ? result.rows[0]?.id : result.lastID
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
    const { nome, telefone, email, interesse, valor, status, observacoes, tags, ultimo_contato, primeiro_contato } = req.body
    const cargos = req.usuario.cargo ? req.usuario.cargo.toLowerCase().split(',').map(c => c.trim()) : []
    const isCorretor = cargos.includes("corretor")
    const isAdmin = cargos.includes("admin") || cargos.includes("head-admin")

    try {
      // Buscar os dados atuais do cliente para detectar mudanças
      const clienteAtualResult = await dbQuery("SELECT nome, status FROM clientes WHERE id = $1", [id])
      if (clienteAtualResult.rows.length === 0) {
        return res.status(404).json({ error: "Cliente não encontrado" })
      }
      const clienteAtual = clienteAtualResult.rows[0]
      const nomeCliente = clienteAtual.nome
      const statusAtual = clienteAtual.status

      // Check if this is a partial update for contact dates only
      const isContactUpdateOnly = (ultimo_contato !== undefined || primeiro_contato !== undefined) &&
                                  (nome === undefined && telefone === undefined && email === undefined &&
                                   interesse === undefined && valor === undefined && status === undefined &&
                                   observacoes === undefined && tags === undefined)

      if (isContactUpdateOnly) {
        // Allow contact date updates for corretores, admins, and head-admins
        if (isCorretor || isAdmin) {
          // For pure corretores, check ownership
          if (isCorretor && !isAdmin) {
            const cliente = await dbQuery("SELECT usuario_id, atribuido_a FROM clientes WHERE id = $1", [id])
            if (cliente.rows[0].usuario_id !== req.usuario.id && cliente.rows[0].atribuido_a !== req.usuario.id) {
              console.log(`[${getDataSaoPaulo()}] [CLIENTES PUT] Corretor tentou editar cliente de outro usuário - usuario_id: ${cliente.rows[0].usuario_id}, atribuido_a: ${cliente.rows[0].atribuido_a}, req.usuario.id: ${req.usuario.id}`)
              return res.status(403).json({ error: "Você não tem permissão para editar este cliente" })
            }
          }

          const result = await dbQuery(
            "UPDATE clientes SET ultimo_contato = $1, primeiro_contato = $2, atualizado_em = CURRENT_TIMESTAMP WHERE id = $3",
            [ultimo_contato || null, primeiro_contato || null, id]
          )
          if (result.rowCount === 0) return res.status(404).json({ error: "Cliente não encontrado" })

          await registrarLog(req.usuario.id, "EDITAR", "Clientes", `Datas de contato atualizadas para cliente: ${nomeCliente}`, nomeCliente, req)
          return res.json({ success: true, message: "Cliente atualizado com sucesso" })
        } else {
          return res.status(403).json({ error: "Permissão negada" })
        }
      }

      if (isCorretor && !isAdmin) {
        const cliente = await dbQuery("SELECT usuario_id, atribuido_a FROM clientes WHERE id = $1", [id])
        if (cliente.rows[0].usuario_id !== req.usuario.id && cliente.rows[0].atribuido_a !== req.usuario.id) {
          console.log(`[${getDataSaoPaulo()}] [CLIENTES PUT] Corretor tentou editar cliente de outro usuário - usuario_id: ${cliente.rows[0].usuario_id}, atribuido_a: ${cliente.rows[0].atribuido_a}, req.usuario.id: ${req.usuario.id}`)
          return res.status(403).json({ error: "Você não tem permissão para editar este cliente" })
        }

        const result = await dbQuery(
          "UPDATE clientes SET interesse = $1, status = $2, observacoes = $3, valor = $4, ultimo_contato = $5, primeiro_contato = $6, atualizado_em = CURRENT_TIMESTAMP WHERE id = $7",
          [interesse || null, status || null, observacoes || null, valor || null, ultimo_contato || null, primeiro_contato || null, id]
        )
        if (result.rowCount === 0) return res.status(404).json({ error: "Cliente não encontrado" })

        // Log sempre que houver mudança de status (corretores)
        if (status !== undefined && status !== statusAtual) {
          await registrarLog(req.usuario.id, "EDITAR", "Clientes", `Status do cliente "${nomeCliente}" alterado de "${statusAtual || 'N/A'}" para "${status || 'N/A'}"`, nomeCliente, req)
        } else if (interesse !== undefined || observacoes !== undefined || valor !== undefined || ultimo_contato !== undefined) {
          await registrarLog(req.usuario.id, "EDITAR", "Clientes", `Cliente atualizado (restrito): ${nomeCliente}`, nomeCliente, req)
        }

        return res.json({ success: true, message: "Cliente atualizado com sucesso" })
      }

      const result = await dbQuery(
        "UPDATE clientes SET nome = $1, telefone = $2, email = $3, interesse = $4, valor = $5, status = $6, observacoes = $7, tags = $8, atualizado_em = CURRENT_TIMESTAMP WHERE id = $9",
        [nome, telefone, email, interesse, valor, status, observacoes, tags, id]
      )
      if (result.rowCount === 0) return res.status(404).json({ error: "Cliente não encontrado" })

      const nomeFinal = nome || nomeCliente

      // Log sempre que houver mudança de status (admins e corretores)
      if (status !== undefined && status !== statusAtual) {
        await registrarLog(req.usuario.id, "EDITAR", "Clientes", `Status do cliente "${nomeFinal}" alterado de "${statusAtual || 'N/A'}" para "${status || 'N/A'}"`, nomeFinal, req)
      } else if (interesse !== undefined || observacoes !== undefined) {
        await registrarLog(req.usuario.id, "EDITAR", "Clientes", `Cliente atualizado: ${nomeFinal}`, nomeFinal, req)
      }

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
  autorizar("admin", "head-admin"),
  [param("id").isInt().withMessage("ID inválido")],
  validarRequisicao,
  async (req, res) => {
    const { id } = req.params
    const cargos = req.usuario.cargo ? req.usuario.cargo.toLowerCase().split(',').map(c => c.trim()) : []
    const isCorretor = cargos.includes("corretor")
    const isAdmin = cargos.includes("admin") || cargos.includes("head-admin")

    try {
      const clienteResult = await dbQuery("SELECT nome, usuario_id FROM clientes WHERE id = $1", [id])
      const cliente = clienteResult.rows[0]

      if (!cliente) {
        return res.status(404).json({ error: "Cliente não encontrado" })
      }

      if (isCorretor && !isAdmin && cliente.usuario_id !== req.usuario.id) {
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
  [param("id").isInt().withMessage("ID inválido")],
  validarRequisicao,
  async (req, res) => {
    try {
      const { id } = req.params
      const { atribuido_a } = req.body

      if (!atribuido_a) {
        return res.status(400).json({ error: "Corretor não especificado" })
      }

      // Verificar se o cliente existe
      const clienteResult = await dbQuery("SELECT nome, atribuido_a FROM clientes WHERE id = $1", [id])
      if (clienteResult.rows.length === 0) {
        return res.status(404).json({ error: "Cliente não encontrado" })
      }

      // Verificar se o corretor existe e é um corretor
      const corretorResult = await dbQuery("SELECT nome FROM usuarios WHERE id = $1 AND permissao LIKE '%corretor%'", [atribuido_a])
      if (corretorResult.rows.length === 0) {
        return res.status(404).json({ error: "Corretor não encontrado" })
      }

      const cliente = clienteResult.rows[0]
      const nomeCliente = cliente.nome
      const nomeCorretor = corretorResult.rows[0].nome

      // Verificar se já está atribuído ao mesmo corretor
      if (cliente.atribuido_a === parseInt(atribuido_a)) {
        return res.status(400).json({ error: "Este cliente já está atribuído a este corretor" })
      }

      // Atualizar atribuição
      const dataAtribuicao = getDataSaoPauloDate(new Date().toISOString())
      const resultado = await dbQuery(
        "UPDATE clientes SET atribuido_a = $1, data_atribuicao = $2, atualizado_em = CURRENT_TIMESTAMP WHERE id = $3",
        [parseInt(atribuido_a), dataAtribuicao, parseInt(id)]
      )

      if (resultado.rowCount === 0) {
        return res.status(404).json({ error: "Cliente não encontrado" })
      }

      await registrarLog(req.usuario.id, "ATRIBUIR_CLIENTE", "Clientes", `Cliente "${nomeCliente}" atribuído ao corretor "${nomeCorretor}"`, nomeCliente, req)

      console.log(`[${getDataSaoPaulo()}] [CLIENTES ATRIBUIR] Cliente ${id} atribuído ao corretor ${atribuido_a} por ${req.usuario.username}`)
      res.json({ message: "Cliente atribuído com sucesso" })
    } catch (err) {
      console.error(`[${getDataSaoPaulo()}] [CLIENTES ATRIBUIR] Erro ao atribuir cliente:`, err)
      res.status(500).json({ error: "Erro ao atribuir cliente: " + err.message })
    }
  }
)

app.post(
  "/api/captacoes",
  autenticar,
  autorizar("admin", "head-admin"),
  [
    body("titulo").trim().notEmpty().withMessage("Título é obrigatório"),
    body("objetivo").trim().notEmpty().withMessage("Objetivo é obrigatório")
  ],
  validarRequisicao,
  async (req, res) => {
    const { titulo, regiao, valor_estimado, prioridade, objetivo, observacoes } = req.body
    const usuarioId = req.usuario.id

    try {
      const result = await dbQuery(
        "INSERT INTO captacoes (titulo, regiao, valor_estimado, prioridade, objetivo, observacoes, usuario_id) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [titulo, regiao, valor_estimado, prioridade, objetivo, observacoes, usuarioId]
      )

      const captacaoId = result.rows ? result.rows[0]?.id : result.lastID
      await registrarLog(req.usuario.id, "CRIAR", "Captações", `Captação criada: ${titulo}`, titulo, req)

      res.status(201).json({ id: captacaoId, message: "Captação criada com sucesso" })
    } catch (err) {
      console.error(`[${getDataSaoPaulo()}] [CAPTAÇÕES] Erro ao criar captação:`, err)
      res.status(500).json({ error: "Erro ao criar captação: " + err.message })
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
      "SELECT id, nome, email, username, permissao, status, telefone, departamento, ultimoAcesso as \"ultimoAcesso\", primeiro_contato, ultimo_contato FROM usuarios ORDER BY nome",
      (err, rows) => {
        if (err) {
          console.error(`[${getDataSaoPaulo()}] [GET USUARIOS] Erro ao buscar usuários:`, err)
          return res.status(500).json({ error: "Erro ao buscar usuários" })
        }
        console.log(`[${getDataSaoPaulo()}] [GET USUARIOS] Retornando ${rows?.length || 0} usuários`)
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
    const { nome, email, username, password, permissao, status, telefone, departamento, primeiro_contato, ultimo_contato } = req.body
    const cargosUsuarioLogado = (req.usuario.cargo || '').toLowerCase().split(',').map(c => c.trim())
    const cargosNovos = permissao.toLowerCase().split(',').map(c => c.trim())

    const isLogadoHeadAdmin = cargosUsuarioLogado.includes("head-admin")
    const isLogadoAdmin = cargosUsuarioLogado.includes("admin")

    const isNovoAdmin = cargosNovos.includes("admin")
    const isNovoHeadAdmin = cargosNovos.includes("head-admin")

    if (!isLogadoHeadAdmin && isLogadoAdmin && (isNovoAdmin || isNovoHeadAdmin)) {
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
        "INSERT INTO usuarios (nome, email, username, senha, permissao, status, telefone, departamento, ultimoAcesso, primeiro_contato, ultimo_contato) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
        [nome, email, username, senhaHash, permissao.toLowerCase(), status || "ativo", telefone || null, departamento || null, new Date().toISOString(), primeiro_contato || null, ultimo_contato || null]
      )
      const usuarioId = result.rows ? result.rows[0]?.id : result.lastID
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
    const { nome, email, password, permissao, status, telefone, departamento, primeiro_contato, ultimo_contato } = req.body
    const cargosUsuarioLogado = (req.usuario.cargo || '').toLowerCase().split(',').map(c => c.trim())
    const usuarioIdSendoEditado = parseInt(id)

    try {
      const userResult = await dbQuery("SELECT permissao, nome as nome_atual FROM usuarios WHERE id = $1", [usuarioIdSendoEditado])
      const usuarioAlvo = userResult.rows[0]

      if (!usuarioAlvo) return res.status(404).json({ error: "Usuário não encontrado" })

      const cargosAlvo = usuarioAlvo.permissao.toLowerCase().split(',').map(c => c.trim())
      const cargosNovos = permissao.toLowerCase().split(',').map(c => c.trim())

      const isLogadoHeadAdmin = cargosUsuarioLogado.includes("head-admin")
      const isLogadoAdmin = cargosUsuarioLogado.includes("admin")

      const isAlvoAdmin = cargosAlvo.includes("admin")
      const isAlvoHeadAdmin = cargosAlvo.includes("head-admin")

      const isNovoAdmin = cargosNovos.includes("admin")
      const isNovoHeadAdmin = cargosNovos.includes("head-admin")

      const isEditandoAsiMesmo = usuarioIdSendoEditado === req.usuario.id

      if (!isEditandoAsiMesmo && !isLogadoHeadAdmin && isLogadoAdmin && (isAlvoAdmin || isAlvoHeadAdmin)) {
        return res.status(403).json({ error: "Admin não pode editar usuários com cargo igual ou superior" })
      }

      if (!isLogadoHeadAdmin && isLogadoAdmin && (isNovoAdmin || isNovoHeadAdmin)) {
        return res.status(403).json({ error: "Admin não pode criar ou modificar para cargos admin ou superior" })
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
          "UPDATE usuarios SET nome = $1, email = $2, senha = $3, permissao = $4, status = $5, telefone = $6, departamento = $7, primeiro_contato = $8, ultimo_contato = $9, atualizado_em = CURRENT_TIMESTAMP WHERE id = $10",
          [nome, email, senhaHash, permissao.toLowerCase(), status, telefone, departamento, primeiro_contato, ultimo_contato, id]
        )
      } else {
        result = await dbQuery(
          "UPDATE usuarios SET nome = $1, email = $2, permissao = $3, status = $4, telefone = $5, departamento = $6, primeiro_contato = $7, ultimo_contato = $8, atualizado_em = CURRENT_TIMESTAMP WHERE id = $9",
          [nome, email, permissao.toLowerCase(), status, telefone, departamento, primeiro_contato, ultimo_contato, id]
        )
      }

      if (result.rowCount === 0) return res.status(404).json({ error: "Usuário não encontrado" })

      const nomeFinal = nome || usuarioAlvo.nome_atual
      await registrarLog(req.usuario.id, "EDITAR", "Usuários", `Usuário atualizado: ${nomeFinal}`, nomeFinal, req)

      let responseData = { success: true, message: "Usuário atualizado com sucesso" }

      if (usuarioIdSendoEditado === req.usuario.id) {
        const novoToken = jwt.sign(
          { id: req.usuario.id, username: req.usuario.username, cargo: permissao.toLowerCase() },
          JWT_SECRET,
          { expiresIn: process.env.JWT_EXPIRE || "24h" }
        )
        responseData.token = novoToken
      }

      res.json(responseData)
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

      const cargosUsuarioLogado = usuarioAtual.cargo?.toLowerCase().split(',').map(c => c.trim())
      const cargosUsuarioAlvo = usuarioAlvo.permissao?.toLowerCase().split(',').map(c => c.trim())

      const isLogadoHeadAdmin = cargosUsuarioLogado.includes("head-admin")
      const isLogadoAdmin = cargosUsuarioLogado.includes("admin")
      
      const isAlvoAdmin = cargosUsuarioAlvo.includes("admin")
      const isAlvoHeadAdmin = cargosUsuarioAlvo.includes("head-admin")

      if (!isLogadoHeadAdmin && isLogadoAdmin && (isAlvoAdmin || isAlvoHeadAdmin)) {
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

// ===== ROTAS DE CORRETORES =====
app.get(
  "/api/corretores",
  autenticar,
  async (req, res) => {
    try {
      const corretores = await dbQuery(
        `SELECT u.id, u.nome, u.email, u.telefone, u.departamento, u.status, u.permissao, COUNT(c.id) as total_clientes
         FROM usuarios u
         LEFT JOIN clientes c ON u.id = c.usuario_id
         WHERE u.permissao LIKE '%corretor%' AND u.status = 'ativo'
         GROUP BY u.id, u.nome, u.email, u.telefone, u.departamento, u.status, u.permissao
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
        `SELECT c.id, c.nome, c.telefone, c.email, c.interesse, c.valor, c.status, c.observacoes, c.data, c.usuario_id, c.tags, c.data_atribuicao, u.nome as cadastrado_por, c.atribuido_a, ua.nome as atribuido_a_nome
         FROM clientes c
         LEFT JOIN usuarios u ON c.usuario_id = u.id
         LEFT JOIN usuarios ua ON c.atribuido_a = ua.id
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
      
      const dataAtribuicaoAtual = getDataSaoPauloDate(new Date().toISOString())

      const resultado = await dbQuery(
        `UPDATE clientes SET atribuido_a = $1, data_atribuicao = $2, atualizado_em = CURRENT_TIMESTAMP WHERE id = $3`,
        [parseInt(corretor_id), dataAtribuicaoAtual, parseInt(cliente_id)]
      )
      
      // Get client and corretor names for proper logging
      const clienteInfo = await dbQuery("SELECT nome FROM clientes WHERE id = $1", [cliente_id])
      const corretorInfo = await dbQuery("SELECT nome FROM usuarios WHERE id = $1", [corretor_id])
      const nomeCliente = clienteInfo.rows[0]?.nome || cliente_id
      const nomeCorretor = corretorInfo.rows[0]?.nome || corretor_id

      await dbQuery(
        `INSERT INTO logs_auditoria (usuario_id, acao, modulo, descricao, usuario_afetado, ip_address) VALUES ($1, $2, $3, $4, $5, $6)`,
        [req.usuario.id, "ATRIBUIR_CLIENTE", "CORRETORES", `Cliente "${nomeCliente}" atribuído ao corretor "${nomeCorretor}"`, nomeCliente, req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for']?.split(',')[0]?.trim()]
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
      
      // Obter nome do cliente para o log
      const clienteInfo = await dbQuery("SELECT nome FROM clientes WHERE id = $1", [cliente_id])
      const nomeCliente = clienteInfo.rows[0]?.nome || cliente_id

      // Obter nome do corretor para o log
      const corretorInfo = await dbQuery("SELECT nome FROM usuarios WHERE id = $1", [corretor_id])
      const nomeCorretor = corretorInfo.rows[0]?.nome || corretor_id

      await dbQuery(
        `INSERT INTO logs_auditoria (usuario_id, acao, modulo, descricao, usuario_afetado, ip_address) VALUES ($1, $2, $3, $4, $5, $6)`,
        [req.usuario.id, "REMOVER_CLIENTE", "CORRETORES", `Cliente "${nomeCliente}" removido do corretor "${nomeCorretor}" (cliente agora sem atribuição)`, nomeCliente, req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for']?.split(',')[0]?.trim()]
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

// ===== ROTAS DE LINKS DOS CORRETORES =====
app.post(
  "/api/links",
  autenticar,
  autorizar("admin", "head-admin"),
  [
    body("titulo").trim().notEmpty().withMessage("Título é obrigatório"),
    body("url").trim().notEmpty().withMessage("URL é obrigatória"),
    body("corretor_ids").isArray().withMessage("Corretores devem ser um array"),
    body("corretor_ids.*").isInt().withMessage("IDs dos corretores devem ser números")
  ],
  validarRequisicao,
  async (req, res) => {
    const { titulo, url, descricao, corretor_ids } = req.body
    const criadoPor = req.usuario.id

    try {
      // Verificar se todos os corretores existem e são corretores
      const placeholders = corretor_ids.map((_, index) => `$${index + 1}`).join(', ')
      const corretoresResult = await dbQuery(
        `SELECT id, nome FROM usuarios WHERE id IN (${placeholders}) AND permissao LIKE '%corretor%'`,
        corretor_ids
      )

      if (corretoresResult.rows.length !== corretor_ids.length) {
        return res.status(404).json({ error: "Um ou mais corretores não encontrados" })
      }

      // Criar o link
      const linkResult = await dbQuery(
        "INSERT INTO corretor_links (titulo, url, descricao, criado_por) VALUES ($1, $2, $3, $4)",
        [titulo, url, descricao || null, criadoPor]
      )

      const linkId = linkResult.lastID || (linkResult.rows && linkResult.rows[0]?.id)

      if (!linkId) {
        console.error("Erro: INSERT result:", linkResult)
        throw new Error("Falha ao obter ID do link criado")
      }

      try {
        // Remover duplicatas dos IDs dos corretores
        const uniqueCorretorIds = [...new Set(corretor_ids)]

        // Criar as atribuições
        for (const corretorId of uniqueCorretorIds) {
          await dbQuery(
            "INSERT INTO link_assignments (link_id, corretor_id) VALUES ($1, $2)",
            [linkId, corretorId]
          )
        }
      } catch (assignmentError) {
        // Se falhar ao criar assignments, deletar o link para manter consistência
        await dbQuery("DELETE FROM corretor_links WHERE id = $1", [linkId])
        throw assignmentError
      }

      const nomesCorretores = corretoresResult.rows.map(c => c.nome).join(', ')
      await registrarLog(req.usuario.id, "CRIAR", "Links Corretores", `Link criado para corretores "${nomesCorretores}": ${titulo}`, nomesCorretores, req)

      res.status(201).json({ id: linkId, message: "Link criado com sucesso" })
    } catch (err) {
      console.error(`[${getDataSaoPaulo()}] [LINKS] Erro ao criar link:`, err)
      res.status(500).json({ error: "Erro ao criar link: " + err.message })
    }
  }
)

app.get(
  "/api/corretores/:corretor_id/links",
  autenticar,
  async (req, res) => {
    try {
      const { corretor_id } = req.params
      const cargos = req.usuario.cargo ? req.usuario.cargo.toLowerCase().split(',').map(c => c.trim()) : []
      const isAdmin = cargos.includes("admin") || cargos.includes("head-admin")
      const isCorretor = cargos.includes("corretor")

      // Verificar permissões: admin pode ver qualquer corretor, corretor só pode ver os próprios links
      if (!isAdmin && (!isCorretor || parseInt(corretor_id) !== req.usuario.id)) {
        return res.status(403).json({ error: "Permissão negada" })
      }

      const result = await dbQuery(`
        SELECT cl.*, uc.nome as criado_por_nome,
               STRING_AGG(u.nome, ', ') as corretores_nomes
        FROM corretor_links cl
        LEFT JOIN link_assignments la ON cl.id = la.link_id
        LEFT JOIN usuarios u ON la.corretor_id = u.id
        LEFT JOIN usuarios uc ON cl.criado_por = uc.id
        WHERE la.corretor_id = $1
        GROUP BY cl.id ORDER BY cl.criado_em DESC
      `, [corretor_id])

      res.json(result.rows || [])
    } catch (err) {
      console.error(`[${getDataSaoPaulo()}] [LINKS] Erro ao buscar links do corretor:`, err)
      res.status(500).json({ error: "Erro ao buscar links: " + err.message })
    }
  }
)

app.get(
  "/api/corretores/links",
  autenticar,
  async (req, res) => {
    try {
      const cargos = req.usuario.cargo ? req.usuario.cargo.toLowerCase().split(',').map(c => c.trim()) : []
      const isAdmin = cargos.includes("admin") || cargos.includes("head-admin")
      const isCorretor = cargos.includes("corretor")
      const usuarioId = req.usuario.id

      let query, params = []

      if (db.isPostgres) {
        // PostgreSQL query with STRING_AGG
        query = `
          SELECT cl.id, cl.titulo, cl.url, cl.descricao, cl.criado_por, cl.criado_em, cl.atualizado_em,
                 uc.nome as criado_por_nome,
                 STRING_AGG(u.nome, ', ') as corretores_nomes
          FROM corretor_links cl
          LEFT JOIN link_assignments la ON cl.id = la.link_id
          LEFT JOIN usuarios u ON la.corretor_id = u.id
          LEFT JOIN usuarios uc ON cl.criado_por = uc.id
        `

        if (!isAdmin && isCorretor) {
          query += " WHERE la.corretor_id = $1"
          params = [usuarioId]
        }

        query += " GROUP BY cl.id, cl.titulo, cl.url, cl.descricao, cl.criado_por, cl.criado_em, cl.atualizado_em, uc.nome ORDER BY cl.criado_em DESC"
      } else {
        // SQLite query with GROUP_CONCAT
        query = `
          SELECT cl.id, cl.titulo, cl.url, cl.descricao, cl.criado_por, cl.criado_em, cl.atualizado_em,
                 uc.nome as criado_por_nome,
                 GROUP_CONCAT(u.nome, ', ') as corretores_nomes
          FROM corretor_links cl
          LEFT JOIN link_assignments la ON cl.id = la.link_id
          LEFT JOIN usuarios u ON la.corretor_id = u.id
          LEFT JOIN usuarios uc ON cl.criado_por = uc.id
        `

        if (!isAdmin && isCorretor) {
          query += " WHERE la.corretor_id = ?"
          params = [usuarioId]
        }

        query += " GROUP BY cl.id, cl.titulo, cl.url, cl.descricao, cl.criado_por, cl.criado_em, cl.atualizado_em, uc.nome ORDER BY cl.criado_em DESC"
      }

      const result = await dbQuery(query, params)

      res.json(result.rows || [])
    } catch (err) {
      console.error(`[${getDataSaoPaulo()}] [LINKS] Erro ao buscar links:`, err)
      res.status(500).json({ error: "Erro ao buscar links: " + err.message })
    }
  }
)

app.put(
  "/api/corretores/links/:id",
  autenticar,
  autorizar("admin", "head-admin"),
  [param("id").isInt().withMessage("ID inválido")],
  validarRequisicao,
  async (req, res) => {
    const { id } = req.params
    const { titulo, url, descricao } = req.body

    try {
      const link = await dbQuery("SELECT titulo FROM corretor_links WHERE id = $1", [id])
      if (link.rows.length === 0) {
        return res.status(404).json({ error: "Link não encontrado" })
      }

      const tituloAtual = link.rows[0].titulo

      await dbQuery(
        "UPDATE corretor_links SET titulo = COALESCE($1, titulo), url = COALESCE($2, url), descricao = COALESCE($3, descricao), atualizado_em = CURRENT_TIMESTAMP WHERE id = $4",
        [titulo, url, descricao, id]
      )

      const tituloFinal = titulo || tituloAtual
      await registrarLog(req.usuario.id, "EDITAR", "Links Corretores", `Link atualizado: ${tituloFinal}`, tituloFinal, req)
      res.json({ success: true, message: "Link atualizado com sucesso" })
    } catch (err) {
      console.error(`[${getDataSaoPaulo()}] [LINKS] Erro ao atualizar link:`, err)
      res.status(500).json({ error: "Erro ao atualizar link: " + err.message })
    }
  }
)

app.delete(
  "/api/corretores/links/:id",
  autenticar,
  autorizar("admin", "head-admin"),
  [param("id").isInt().withMessage("ID inválido")],
  validarRequisicao,
  async (req, res) => {
    const { id } = req.params

    try {
      const link = await dbQuery("SELECT titulo FROM corretor_links WHERE id = $1", [id])
      if (link.rows.length === 0) {
        return res.status(404).json({ error: "Link não encontrado" })
      }

      const titulo = link.rows[0].titulo

      await dbQuery("DELETE FROM corretor_links WHERE id = $1", [id])

      await registrarLog(req.usuario.id, "DELETAR", "Links Corretores", `Link deletado: ${titulo}`, titulo, req)
      res.json({ success: true, message: "Link deletado com sucesso" })
    } catch (err) {
      console.error(`[${getDataSaoPaulo()}] [LINKS] Erro ao deletar link:`, err)
      res.status(500).json({ error: "Erro ao deletar link: " + err.message })
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

// ===== ROTA PARA HISTÓRICO DE ATRIBUIÇÕES =====
app.get("/api/clientes/:id/historico-atribuicoes", autenticar, autorizar("admin", "head-admin"), async (req, res) => {
  try {
    const { id } = req.params

    // Verificar se o cliente existe
    const cliente = await dbQuery("SELECT nome, data, criado_em FROM clientes WHERE id = $1", [id])
    if (cliente.rows.length === 0) {
      return res.status(404).json({ error: "Cliente não encontrado" })
    }

    // Buscar histórico de atribuições nos logs
    const logs = await dbQuery(`
      SELECT l.*, u.nome as usuario_logado_nome
      FROM logs_auditoria l
      LEFT JOIN usuarios u ON l.usuario_id = u.id
      WHERE l.modulo = 'CORRETORES'
        AND (l.acao = 'ATRIBUIR_CLIENTE' OR l.acao = 'REMOVER_CLIENTE')
        AND l.usuario_afetado = $1
      ORDER BY l.criado_em ASC
    `, [cliente.rows[0].nome])

    // Buscar primeira atribuição (se houver) e data de cadastro
    const primeiraAtribuicao = await dbQuery(`
      SELECT c.atribuido_a, c.criado_em, c.data as data_cadastro, u.nome as corretor_nome
      FROM clientes c
      LEFT JOIN usuarios u ON c.atribuido_a = u.id
      WHERE c.id = $1 AND c.atribuido_a IS NOT NULL
    `, [id])

    // Função para formatar data no timezone de São Paulo
    const formatarDataSaoPaulo = (dataString) => {
      if (!dataString) return "-"
      const data = new Date(dataString)
      return data.toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      })
    }

    // Função para formatar data simples (apenas data, sem hora)
    const formatarDataSimples = (dataString) => {
      if (!dataString) return "-"
      try {
        const data = new Date(dataString)
        return data.toLocaleDateString('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        })
      } catch (error) {
        console.error("Erro ao formatar data:", error, "dataString:", dataString)
        return "-"
      }
    }

    const historico = {
      cliente_nome: cliente.rows[0].nome,
      // Usar criado_em que tem a data e hora reais da criação
      data_cadastro: formatarDataSaoPaulo(cliente.rows[0].criado_em),
      primeira_atribuicao: primeiraAtribuicao.rows.length > 0 ? {
        corretor_nome: primeiraAtribuicao.rows[0].corretor_nome,
        data: formatarDataSaoPaulo(primeiraAtribuicao.rows[0].criado_em)
      } : null,
      atribuicoes: logs.rows.map(log => ({
        acao: log.acao,
        descricao: log.descricao,
        usuario_logado: log.usuario_logado_nome || log.usuario_afetado,
        data: formatarDataSaoPaulo(log.criado_em)
      }))
    }

    res.json(historico)
  } catch (err) {
    console.error(`[${getDataSaoPaulo()}] [HISTORICO ATRIBUICOES] Erro ao buscar histórico:`, err)
    res.status(500).json({ error: "Erro ao buscar histórico de atribuições: " + err.message })
  }
})

// ===== ROTA PARA HISTÓRICO DE STATUS =====
app.get("/api/clientes/:id/historico-status", autenticar, autorizar("admin", "head-admin"), async (req, res) => {
  try {
    const { id } = req.params

    // Verificar se o cliente existe
    const cliente = await dbQuery("SELECT nome, status, criado_em FROM clientes WHERE id = $1", [id])
    if (cliente.rows.length === 0) {
      return res.status(404).json({ error: "Cliente não encontrado" })
    }

    // Buscar histórico de mudanças de status nos logs
    const logs = await dbQuery(`
      SELECT l.*, u.nome as usuario_logado_nome
      FROM logs_auditoria l
      LEFT JOIN usuarios u ON l.usuario_id = u.id
      WHERE l.modulo = 'Clientes'
        AND l.acao = 'EDITAR'
        AND l.usuario_afetado = $1
        AND l.descricao LIKE '%Status do cliente%'
      ORDER BY l.criado_em ASC
    `, [cliente.rows[0].nome])

    // Função para formatar data no timezone de São Paulo
    const formatarDataSaoPaulo = (dataString) => {
      if (!dataString) return "-"
      const data = new Date(dataString)
      return data.toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      })
    }

    // Extrair mudanças de status das descrições dos logs
    const historicoStatus = []

    // Adicionar status atual se não houver histórico
    if (logs.rows.length === 0) {
      historicoStatus.push({
        status: cliente.rows[0].status,
        data: formatarDataSaoPaulo(cliente.rows[0].criado_em),
        usuario: "Sistema",
        descricao: "Status inicial do cliente"
      })
    } else {
      // Processar logs para extrair mudanças de status
      logs.rows.forEach(log => {
        const descricao = log.descricao || ""

        // Usar regex para extrair informações do log específico
        const statusMatch = descricao.match(/Status do cliente "([^"]+)" alterado de "([^"]+)" para "([^"]+)"/)
        if (statusMatch) {
          const [, clienteNome, statusAntigo, statusNovo] = statusMatch

          historicoStatus.push({
            status: statusNovo,
            data: formatarDataSaoPaulo(log.criado_em),
            usuario: log.usuario_logado_nome || "Sistema",
            descricao: `Alterado de "${statusAntigo}" para "${statusNovo}"`
          })
        }
      })

      // Se não conseguiu extrair nenhum status dos logs, adicionar o status atual
      if (historicoStatus.length === 0) {
        historicoStatus.push({
          status: cliente.rows[0].status,
          data: formatarDataSaoPaulo(cliente.rows[0].criado_em),
          usuario: "Sistema",
          descricao: "Status atual do cliente"
        })
      }
    }

    const historico = {
      cliente_nome: cliente.rows[0].nome,
      status_atual: cliente.rows[0].status,
      cliente_criado_em: cliente.rows[0].criado_em,
      historico_status: historicoStatus
    }

    res.json(historico)
  } catch (err) {
    console.error(`[${getDataSaoPaulo()}] [HISTORICO STATUS] Erro ao buscar histórico:`, err)
    res.status(500).json({ error: "Erro ao buscar histórico de status: " + err.message })
  }
})

// ===== ROTAS DE AGENDAMENTOS =====
app.get("/api/agendamentos", autenticar, async (req, res) => {
  try {
    const cargos = req.usuario.cargo ? req.usuario.cargo.toLowerCase().split(',').map(c => c.trim()) : []
    const isCorretor = cargos.includes("corretor")
    const isAdmin = cargos.includes("admin") || cargos.includes("head-admin")
    const usuarioId = req.usuario.id

    let query = `
      SELECT a.*, c.nome as cliente_nome, c.telefone as cliente_telefone, u.nome as usuario_nome, cr.nome as corretor_nome
      FROM agendamentos a
      LEFT JOIN clientes c ON a.cliente_id = c.id
      LEFT JOIN usuarios u ON a.usuario_id = u.id
      LEFT JOIN usuarios cr ON a.corretor_id = cr.id
    `
    let params = []

    if (isCorretor && !isAdmin) {
      query += " WHERE a.usuario_id = $1 OR a.corretor_id = $2"
      params = [usuarioId, usuarioId]
    }

    query += " ORDER BY a.data ASC, a.hora ASC"

    const result = await dbQuery(query, params)
    res.json(result.rows || [])
  } catch (err) {
    console.error(`[${getDataSaoPaulo()}] [AGENDAMENTOS] Erro ao buscar agendamentos:`, err)
    res.status(500).json({ error: "Erro ao buscar agendamentos: " + err.message })
  }
})

app.post(
  "/api/agendamentos",
  autenticar,
  [
    body("cliente_id").isInt().withMessage("Cliente inválido"),
    body("data").trim().notEmpty().withMessage("Data é obrigatória"),
    body("hora").trim().notEmpty().withMessage("Hora é obrigatória"),
    body("tipo").trim().notEmpty().withMessage("Tipo é obrigatório")
  ],
  validarRequisicao,
  async (req, res) => {
    const { cliente_id, corretor_id, data, hora, tipo, status, observacoes } = req.body
    const usuarioId = req.usuario.id

    try {
      // Verificar se o cliente existe e obter nome
      const cliente = await dbQuery("SELECT nome FROM clientes WHERE id = $1", [cliente_id])
      if (cliente.rows.length === 0) {
        return res.status(404).json({ error: "Cliente não encontrado" })
      }
      const nomeCliente = cliente.rows[0].nome

      const result = await dbQuery(
        "INSERT INTO agendamentos (cliente_id, corretor_id, usuario_id, data, hora, tipo, status, observacoes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        [cliente_id, corretor_id || null, usuarioId, data, hora, tipo, status || 'agendado', observacoes || null]
      )

      const agendamentoId = result.rows ? result.rows[0]?.id : result.lastID
      await registrarLog(req.usuario.id, "CRIAR", "Agendamentos", `Agendamento criado para cliente "${nomeCliente}"`, nomeCliente, req)

      res.status(201).json({ id: agendamentoId, message: "Agendamento criado com sucesso" })
    } catch (err) {
      console.error(`[${getDataSaoPaulo()}] [AGENDAMENTOS] Erro ao criar agendamento:`, err)
      res.status(500).json({ error: "Erro ao criar agendamento: " + err.message })
    }
  }
)

app.put(
  "/api/agendamentos/:id",
  autenticar,
  [param("id").isInt().withMessage("ID inválido")],
  validarRequisicao,
  async (req, res) => {
    const { id } = req.params
    const { corretor_id, data, hora, tipo, status, observacoes } = req.body
    const cargos = req.usuario.cargo ? req.usuario.cargo.toLowerCase().split(',').map(c => c.trim()) : []
    const isCorretor = cargos.includes("corretor")
    const isAdmin = cargos.includes("admin") || cargos.includes("head-admin")

    try {
      const agendamento = await dbQuery(`
        SELECT a.usuario_id, c.nome as cliente_nome
        FROM agendamentos a
        LEFT JOIN clientes c ON a.cliente_id = c.id
        WHERE a.id = $1
      `, [id])
      if (agendamento.rows.length === 0) {
        return res.status(404).json({ error: "Agendamento não encontrado" })
      }

      if (isCorretor && !isAdmin && agendamento.rows[0].usuario_id !== req.usuario.id) {
        return res.status(403).json({ error: "Permissão negada" })
      }

      await dbQuery(
        "UPDATE agendamentos SET corretor_id = COALESCE($1, corretor_id), data = COALESCE($2, data), hora = COALESCE($3, hora), tipo = COALESCE($4, tipo), status = COALESCE($5, status), observacoes = COALESCE($6, observacoes), atualizado_em = CURRENT_TIMESTAMP WHERE id = $7",
        [corretor_id, data, hora, tipo, status, observacoes, id]
      )

      const nomeCliente = agendamento.rows[0].cliente_nome || "Cliente não encontrado"
      await registrarLog(req.usuario.id, "EDITAR", "Agendamentos", `Agendamento para "${nomeCliente}" atualizado`, nomeCliente, req)
      res.json({ success: true, message: "Agendamento atualizado com sucesso" })
    } catch (err) {
      console.error(`[${getDataSaoPaulo()}] [AGENDAMENTOS] Erro ao atualizar agendamento:`, err)
      res.status(500).json({ error: "Erro ao atualizar agendamento: " + err.message })
    }
  }
)

app.delete(
  "/api/agendamentos/:id",
  autenticar,
  [param("id").isInt().withMessage("ID inválido")],
  validarRequisicao,
  async (req, res) => {
    const { id } = req.params
    const cargos = req.usuario.cargo ? req.usuario.cargo.toLowerCase().split(',').map(c => c.trim()) : []
    const isCorretor = cargos.includes("corretor")
    const isAdmin = cargos.includes("admin") || cargos.includes("head-admin")

    try {
      const agendamento = await dbQuery(`
        SELECT a.usuario_id, c.nome as cliente_nome
        FROM agendamentos a
        LEFT JOIN clientes c ON a.cliente_id = c.id
        WHERE a.id = $1
      `, [id])
      if (agendamento.rows.length === 0) {
        return res.status(404).json({ error: "Agendamento não encontrado" })
      }

      if (isCorretor && !isAdmin && agendamento.rows[0].usuario_id !== req.usuario.id) {
        return res.status(403).json({ error: "Permissão negada" })
      }

      await dbQuery("DELETE FROM agendamentos WHERE id = $1", [id])

      const nomeCliente = agendamento.rows[0].cliente_nome || "Cliente não encontrado"
      await registrarLog(req.usuario.id, "DELETAR", "Agendamentos", `Agendamento para "${nomeCliente}" deletado`, nomeCliente, req)
      res.json({ success: true, message: "Agendamento deletado com sucesso" })
    } catch (err) {
      console.error(`[${getDataSaoPaulo()}] [AGENDAMENTOS] Erro ao deletar agendamento:`, err)
      res.status(500).json({ error: "Erro ao deletar agendamento: " + err.message })
    }
  }
)

// ===== ROTAS DE CAPTAÇÕES =====
app.get("/api/captacoes", autenticar, async (req, res) => {
  try {
    const result = await dbQuery(`
      SELECT c.*, u.nome as usuario_nome
      FROM captacoes c
      LEFT JOIN usuarios u ON c.usuario_id = u.id
      ORDER BY c.prioridade DESC, c.criado_em DESC
    `)
    res.json(result.rows || [])
  } catch (err) {
    console.error(`[${getDataSaoPaulo()}] [CAPTAÇÕES] Erro ao buscar captações:`, err)
    res.status(500).json({ error: "Erro ao buscar captações: " + err.message })
  }
})

app.post(
  "/api/captacoes",
  autenticar,
  autorizar("admin", "head-admin"),
  [
    body("titulo").trim().notEmpty().withMessage("Título é obrigatório"),
    body("objetivo").trim().notEmpty().withMessage("Objetivo é obrigatório")
  ],
  validarRequisicao,
  async (req, res) => {
    const { titulo, valor_estimado, prioridade, objetivo, observacoes } = req.body
    const usuarioId = req.usuario.id

    try {
      const result = await dbQuery(
        "INSERT INTO captacoes (titulo, valor_estimado, prioridade, objetivo, observacoes, usuario_id) VALUES ($1, $2, $3, $4, $5, $6)",
        [titulo, valor_estimado, prioridade, objetivo, observacoes, usuarioId]
      )

      const captacaoId = result.rows ? result.rows[0]?.id : result.lastID
      await registrarLog(req.usuario.id, "CRIAR", "Captações", `Captação criada: ${titulo}`, titulo, req)

      res.status(201).json({ id: captacaoId, message: "Captação criada com sucesso" })
    } catch (err) {
      console.error(`[${getDataSaoPaulo()}] [CAPTAÇÕES] Erro ao criar captação:`, err)
      res.status(500).json({ error: "Erro ao criar captação: " + err.message })
    }
  }
)

app.put(
  "/api/captacoes/:id",
  autenticar,
  autorizar("admin", "head-admin"),
  [param("id").isInt().withMessage("ID inválido")],
  validarRequisicao,
  async (req, res) => {
    const { id } = req.params
    const { titulo, regiao, valor_estimado, prioridade, objetivo, observacoes } = req.body

    try {
      const captacao = await dbQuery("SELECT titulo FROM captacoes WHERE id = $1", [id])
      if (captacao.rows.length === 0) {
        return res.status(404).json({ error: "Captação não encontrada" })
      }

      const tituloAtual = captacao.rows[0].titulo

      await dbQuery(
        "UPDATE captacoes SET titulo = COALESCE($1, titulo), regiao = COALESCE($2, regiao), valor_estimado = COALESCE($3, valor_estimado), prioridade = COALESCE($4, prioridade), objetivo = COALESCE($5, objetivo), observacoes = COALESCE($6, observacoes), atualizado_em = CURRENT_TIMESTAMP WHERE id = $7",
        [titulo, regiao, valor_estimado, prioridade, objetivo, observacoes, id]
      )

      const tituloFinal = titulo || tituloAtual
      await registrarLog(req.usuario.id, "EDITAR", "Captações", `Captação atualizada: ${tituloFinal}`, tituloFinal, req)
      res.json({ success: true, message: "Captação atualizada com sucesso" })
    } catch (err) {
      console.error(`[${getDataSaoPaulo()}] [CAPTAÇÕES] Erro ao atualizar captação:`, err)
      res.status(500).json({ error: "Erro ao atualizar captação: " + err.message })
    }
  }
)

app.delete(
  "/api/captacoes/:id",
  autenticar,
  autorizar("admin", "head-admin"),
  [param("id").isInt().withMessage("ID inválido")],
  validarRequisicao,
  async (req, res) => {
    const { id } = req.params

    try {
      const captacao = await dbQuery("SELECT titulo FROM captacoes WHERE id = $1", [id])
      if (captacao.rows.length === 0) {
        return res.status(404).json({ error: "Captação não encontrada" })
      }

      const titulo = captacao.rows[0].titulo

      await dbQuery("DELETE FROM captacoes WHERE id = $1", [id])

      await registrarLog(req.usuario.id, "DELETAR", "Captações", `Captação deletada: ${titulo}`, titulo, req)
      res.json({ success: true, message: "Captação deletada com sucesso" })
    } catch (err) {
      console.error(`[${getDataSaoPaulo()}] [CAPTAÇÕES] Erro ao deletar captação:`, err)
      res.status(500).json({ error: "Erro ao deletar captação: " + err.message })
    }
  }
)

//// ===== ROTAS DE BUG REPORTS (PARA ADMINS E HEAD ADMINS) =====
app.get("/api/bug-reports", autenticar, autorizar("admin", "head-admin"), async (req, res) => {
  try {
    const result = await dbQuery(`
      SELECT br.*, u.nome as usuario_nome, u.username as usuario_username
      FROM bug_reports br
      LEFT JOIN usuarios u ON br.usuario_id = u.id
      ORDER BY br.atualizado_em DESC
    `)

    const bugReports = result.rows.map(report => ({
      id: report.id,
      titulo: report.titulo,
      descricao: report.descricao,
      prioridade: report.prioridade,
      status: report.status,
      categoria: report.categoria,
      usuario_id: report.usuario_id,
      usuario_nome: report.usuario_nome || report.usuario_username,
      criado_em: report.criado_em,
      atualizado_em: report.atualizado_em
    }))

    res.json(bugReports)
  } catch (err) {
    console.error(`[${getDataSaoPaulo()}] [BUG-REPORTS] Erro ao buscar bug reports:`, err)
    res.status(500).json({ error: "Erro ao buscar bug reports: " + err.message })
  }
})

app.post(
  "/api/bug-reports",
  autenticar,
  autorizar("admin", "head-admin"),
  [
    body("titulo").trim().notEmpty().withMessage("Título é obrigatório"),
    body("descricao").trim().notEmpty().withMessage("Descrição é obrigatória"),
    body("prioridade").optional().isIn(["baixa", "media", "alta", "critica"]).withMessage("Prioridade inválida"),
    body("categoria").optional().trim()
  ],
  validarRequisicao,
  async (req, res) => {
    const { titulo, descricao, prioridade, categoria } = req.body
    const usuarioId = req.usuario.id

    try {
      const result = await dbQuery(
        "INSERT INTO bug_reports (titulo, descricao, prioridade, categoria, usuario_id) VALUES ($1, $2, $3, $4, $5)",
        [titulo, descricao, prioridade || "media", categoria || "geral", usuarioId]
      )

      const bugReportId = result.rows ? result.rows[0]?.id : result.lastID
      await registrarLog(req.usuario.id, "CRIAR", "Bug Reports", `Bug report criado: ${titulo}`, titulo, req)

      res.status(201).json({
        id: bugReportId,
        message: "Bug report criado com sucesso"
      })
    } catch (err) {
      console.error(`[${getDataSaoPaulo()}] [BUG-REPORTS] Erro ao criar bug report:`, err)
      res.status(500).json({ error: "Erro ao criar bug report: " + err.message })
    }
  }
)

app.get("/api/bug-reports/:id", autenticar, autorizar("admin", "head-admin"), async (req, res) => {
  try {
    const { id } = req.params

    const bugReportResult = await dbQuery(`
      SELECT br.*, u.nome as usuario_nome, u.username as usuario_username
      FROM bug_reports br
      LEFT JOIN usuarios u ON br.usuario_id = u.id
      WHERE br.id = $1
    `, [id])

    if (bugReportResult.rows.length === 0) {
      return res.status(404).json({ error: "Bug report não encontrado" })
    }

    const messagesResult = await dbQuery(`
      SELECT bm.*, u.nome as usuario_nome, u.username as usuario_username
      FROM bug_report_messages bm
      LEFT JOIN usuarios u ON bm.usuario_id = u.id
      WHERE bm.bug_report_id = $1
      ORDER BY bm.criado_em ASC
    `, [id])

    const bugReport = {
      id: bugReportResult.rows[0].id,
      titulo: bugReportResult.rows[0].titulo,
      descricao: bugReportResult.rows[0].descricao,
      prioridade: bugReportResult.rows[0].prioridade,
      status: bugReportResult.rows[0].status,
      categoria: bugReportResult.rows[0].categoria,
      usuario_id: bugReportResult.rows[0].usuario_id,
      usuario_nome: bugReportResult.rows[0].usuario_nome || bugReportResult.rows[0].usuario_username,
      criado_em: bugReportResult.rows[0].criado_em,
      atualizado_em: bugReportResult.rows[0].atualizado_em,
      messages: messagesResult.rows.map(msg => ({
        id: msg.id,
        mensagem: msg.mensagem,
        usuario_id: msg.usuario_id,
        usuario_nome: msg.usuario_nome || msg.usuario_username,
        criado_em: msg.criado_em
      }))
    }

    res.json(bugReport)
  } catch (err) {
    console.error(`[${getDataSaoPaulo()}] [BUG-REPORTS] Erro ao buscar bug report:`, err)
    res.status(500).json({ error: "Erro ao buscar bug report: " + err.message })
  }
})

app.put(
  "/api/bug-reports/:id",
  autenticar,
  autorizar("admin", "head-admin"),
  [param("id").isInt().withMessage("ID inválido")],
  validarRequisicao,
  async (req, res) => {
    const { id } = req.params
    const { titulo, descricao, prioridade, status, categoria } = req.body

    try {
      const result = await dbQuery(
        "UPDATE bug_reports SET titulo = $1, descricao = $2, prioridade = $3, status = $4, categoria = $5, atualizado_em = CURRENT_TIMESTAMP WHERE id = $6",
        [titulo, descricao, prioridade, status, categoria, id]
      )

      if (result.rowCount === 0) {
        return res.status(404).json({ error: "Bug report não encontrado" })
      }

      await registrarLog(req.usuario.id, "EDITAR", "Bug Reports", `Bug report atualizado: ${titulo || id}`, titulo || id, req)
      res.json({ success: true, message: "Bug report atualizado com sucesso" })
    } catch (err) {
      console.error(`[${getDataSaoPaulo()}] [BUG-REPORTS] Erro ao atualizar bug report:`, err)
      res.status(500).json({ error: "Erro ao atualizar bug report: " + err.message })
    }
  }
)

app.post(
  "/api/bug-reports/:id/messages",
  autenticar,
  autorizar("admin", "head-admin"),
  [
    param("id").isInt().withMessage("ID inválido"),
    body("mensagem").trim().notEmpty().withMessage("Mensagem é obrigatória")
  ],
  validarRequisicao,
  async (req, res) => {
    const { id } = req.params
    const { mensagem } = req.body
    const usuarioId = req.usuario.id

    try {
      // Verificar se o bug report existe
      const bugReport = await dbQuery("SELECT id, titulo FROM bug_reports WHERE id = $1", [id])
      if (bugReport.rows.length === 0) {
        return res.status(404).json({ error: "Bug report não encontrado" })
      }

      const result = await dbQuery(
        "INSERT INTO bug_report_messages (bug_report_id, usuario_id, mensagem) VALUES ($1, $2, $3)",
        [id, usuarioId, mensagem]
      )

      // Atualizar a data do bug report
      await dbQuery("UPDATE bug_reports SET atualizado_em = CURRENT_TIMESTAMP WHERE id = $1", [id])

      const messageId = result.rows ? result.rows[0]?.id : result.lastID
      await registrarLog(req.usuario.id, "COMENTAR", "Bug Reports", `Comentário adicionado ao bug report: ${bugReport.rows[0].titulo}`, bugReport.rows[0].titulo, req)

      res.status(201).json({
        id: messageId,
        message: "Mensagem enviada com sucesso"
      })
    } catch (err) {
      console.error(`[${getDataSaoPaulo()}] [BUG-REPORTS] Erro ao enviar mensagem:`, err)
      res.status(500).json({ error: "Erro ao enviar mensagem: " + err.message })
    }
  }
)

app.delete(
  "/api/bug-reports/:id",
  autenticar,
  autorizar("admin", "head-admin"),
  [param("id").isInt().withMessage("ID inválido")],
  validarRequisicao,
  async (req, res) => {
    const { id } = req.params

    try {
      const bugReport = await dbQuery("SELECT titulo FROM bug_reports WHERE id = $1", [id])
      if (bugReport.rows.length === 0) {
        return res.status(404).json({ error: "Bug report não encontrado" })
      }

      const titulo = bugReport.rows[0].titulo

      // As mensagens serão deletadas automaticamente devido ao CASCADE
      const result = await dbQuery("DELETE FROM bug_reports WHERE id = $1", [id])

      if (result.rowCount === 0) {
        return res.status(404).json({ error: "Bug report não encontrado" })
      }

      await registrarLog(req.usuario.id, "DELETAR", "Bug Reports", `Bug report deletado: ${titulo}`, titulo, req)
      res.json({ success: true, message: "Bug report deletado com sucesso" })
    } catch (err) {
      console.error(`[${getDataSaoPaulo()}] [BUG-REPORTS] Erro ao deletar bug report:`, err)
      res.status(500).json({ error: "Erro ao deletar bug report: " + err.message })
    }
  }
)

// ===== SERVIR ARQUIVO RAIZ =====
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "src", "pages", "index.html"))
})

app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "src", "pages", "dashboard.html"))
})

app.get("/clientes", (req, res) => {
  res.sendFile(path.join(__dirname, "src", "pages", "clientes.html"))
})

app.get("/agendamentos", (req, res) => {
  res.sendFile(path.join(__dirname, "src", "pages", "agendamentos.html"))
})

app.get("/usuarios", (req, res) => {
  res.sendFile(path.join(__dirname, "src", "pages", "usuarios.html"))
})

app.get("/corretores", (req, res) => {
  res.sendFile(path.join(__dirname, "src", "pages", "corretores.html"))
})

app.get("/logs", (req, res) => {
  res.sendFile(path.join(__dirname, "src", "pages", "logs.html"))
})

app.get("/bug-reports", (req, res) => {
  res.sendFile(path.join(__dirname, "src", "pages", "bug-reports.html"))
})

app.get("/busca", (req, res) => {
  res.sendFile(path.join(__dirname, "src", "pages", "busca.html"))
})

app.get("/links", (req, res) => {
  res.sendFile(path.join(__dirname, "src", "pages", "links.html"))
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

// ===== SOCKET.IO SETUP =====
const server = http.createServer(app)
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
})

// Middleware de autenticação para Socket.IO
io.use((socket, next) => {
  const token = socket.handshake.auth.token
  if (!token) {
    return next(new Error("Token não fornecido"))
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    socket.usuario = decoded
    console.log(`[${getDataSaoPaulo()}] [SOCKET] Usuário autenticado: ${decoded.username}`)
    next()
  } catch (err) {
    console.error(`[${getDataSaoPaulo()}] [SOCKET] Token inválido:`, err.message)
    next(new Error("Token inválido"))
  }
})

// Gerenciar conexões Socket.IO
io.on('connection', (socket) => {
  console.log(`[${getDataSaoPaulo()}] [SOCKET] Usuário conectado: ${socket.usuario.username} (ID: ${socket.id})`)

  // Entrar em uma sala de bug report específico
  socket.on('join-bug-report', (bugReportId) => {
    socket.join(`bug-report-${bugReportId}`)
    console.log(`[${getDataSaoPaulo()}] [SOCKET] ${socket.usuario.username} entrou na sala do bug report ${bugReportId}`)
  })

  // Sair de uma sala de bug report
  socket.on('leave-bug-report', (bugReportId) => {
    socket.leave(`bug-report-${bugReportId}`)
    console.log(`[${getDataSaoPaulo()}] [SOCKET] ${socket.usuario.username} saiu da sala do bug report ${bugReportId}`)
  })

  // Enviar mensagem em tempo real
  socket.on('send-message', async (data) => {
    try {
      const { id, mensagem } = data
      const usuarioId = socket.usuario.id

      // Verificar se o bug report existe
      const bugReport = await dbQuery("SELECT id, titulo FROM bug_reports WHERE id = $1", [id])
      if (bugReport.rows.length === 0) {
        socket.emit('message-error', { error: "Bug report não encontrado" })
        return
      }

      // Inserir a mensagem no banco
      const result = await dbQuery(
        "INSERT INTO bug_report_messages (bug_report_id, usuario_id, mensagem) VALUES ($1, $2, $3)",
        [id, usuarioId, mensagem]
      )

      // Atualizar a data do bug report
      await dbQuery("UPDATE bug_reports SET atualizado_em = CURRENT_TIMESTAMP WHERE id = $1", [id])

      const messageId = result.rows ? result.rows[0]?.id : result.lastID
      // Get the created timestamp
      const criadoEm = new Date().toISOString()

      // Buscar dados do usuário para a resposta
      const userResult = await dbQuery("SELECT nome, username FROM usuarios WHERE id = $1", [usuarioId])
      const usuario = userResult.rows[0]

      // Criar objeto da mensagem
      const messageData = {
        id: messageId,
        mensagem: mensagem,
        usuario_id: usuarioId,
        usuario_nome: usuario.nome || usuario.username,
        criado_em: criadoEm
      }

      // Emitir para todos na sala do bug report
      io.to(`bug-report-${id}`).emit('new-message', messageData)

      // Emitir confirmação para o remetente
      socket.emit('message-sent')

      console.log(`[${getDataSaoPaulo()}] [SOCKET] Mensagem enviada no bug report ${id} por ${socket.usuario.username}`)

    } catch (err) {
      console.error(`[${getDataSaoPaulo()}] [SOCKET] Erro ao enviar mensagem:`, err)
      socket.emit('message-error', { error: "Erro ao enviar mensagem" })
    }
  })

  socket.on('disconnect', () => {
    console.log(`[${getDataSaoPaulo()}] [SOCKET] Usuário desconectado: ${socket.usuario.username} (ID: ${socket.id})`)
  })
})

// ===== INICIAR SERVIDOR =====
server.listen(PORT, () => {
  console.log(`[${getDataSaoPaulo()}] Servidor Concretizza rodando na porta ${PORT}`)
  console.log(`[${getDataSaoPaulo()}] Ambiente: ${process.env.NODE_ENV || "development"}`)
})

process.on("SIGINT", () => {
  pool.end()
  server.close(() => {
    console.log(`[${getDataSaoPaulo()}] Servidor encerrado`)
    process.exit()
  })
})
