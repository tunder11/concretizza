const { Pool } = require("pg")
const bcrypt = require("bcryptjs")

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
})

const BCRYPT_ROUNDS = 10

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

async function seedDatabase() {
  try {
    for (const usuario of usuariosPadrao) {
      try {
        const senhaHash = await bcrypt.hash(usuario.password, BCRYPT_ROUNDS)

        await pool.query(
          `INSERT INTO usuarios (nome, email, username, senha, permissao, status)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (username) DO NOTHING`,
          [usuario.nome, usuario.email, usuario.username, senhaHash, usuario.permissao, "ativo"]
        )

        console.log(`[${getDataSaoPaulo()}] ✓ Usuário ${usuario.username} criado/atualizado`)
      } catch (error) {
        console.error(`[${getDataSaoPaulo()}] ✗ Erro ao criar usuário ${usuario.username}:`, error.message)
      }
    }

    console.log(`[${getDataSaoPaulo()}] ✓ Seed concluído com sucesso!`)
  } catch (error) {
    console.error(`[${getDataSaoPaulo()}] Erro durante seed:`, error)
  } finally {
    await pool.end()
    process.exit(0)
  }
}

seedDatabase().catch((error) => {
  console.error(`[${getDataSaoPaulo()}] Erro durante seed:`, error)
  process.exit(1)
})
