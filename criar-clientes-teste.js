require("dotenv").config()
const db = require("./db")

async function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err, result) => {
      if (err) reject(err)
      else resolve(result)
    })
  })
}

async function dbQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err)
      else resolve({ rows: rows || [], rowCount: rows ? rows.length : 0 })
    })
  })
}

async function criarClientesTeste() {
  try {
    const clientesTeste = [
      {
        nome: "João Silva",
        telefone: "(11) 98765-4321",
        email: "joao.silva@email.com",
        interesse: "comprar",
        valor: "500000",
        status: "novo",
        observacoes: "Cliente novo, primeira vez"
      },
      {
        nome: "Maria Santos",
        telefone: "(11) 99876-5432",
        email: "maria.santos@email.com",
        interesse: "alugar",
        valor: "3000",
        status: "quente",
        observacoes: "Cliente interessado, acompanhar"
      },
      {
        nome: "Pedro Oliveira",
        telefone: "(11) 98765-4322",
        email: "pedro@email.com",
        interesse: "vender",
        valor: "750000",
        status: "novo",
        observacoes: "Quer vender propriedade"
      },
      {
        nome: "Ana Costa",
        telefone: "(11) 99876-5433",
        email: "ana.costa@email.com",
        interesse: "comprar",
        valor: "400000",
        status: "frio",
        observacoes: "Cliente sem responder"
      },
      {
        nome: "Carlos Ferreira",
        telefone: "(11) 98765-4323",
        email: "carlos.f@email.com",
        interesse: "alugar",
        valor: "2500",
        status: "quente",
        observacoes: "Urgente - precisa alugar em 2 semanas"
      },
      {
        nome: "Beatriz Lima",
        telefone: "(11) 99876-5434",
        email: "beatriz.lima@email.com",
        interesse: "comprar",
        valor: "600000",
        status: "novo",
        observacoes: "Encaminhamento recente"
      },
      {
        nome: "Lucas Martins",
        telefone: "(11) 98765-4324",
        email: "lucas.m@email.com",
        interesse: "vender",
        valor: "950000",
        status: "quente",
        observacoes: "Cliente motivado"
      },
      {
        nome: "Fernanda Rocha",
        telefone: "(11) 99876-5435",
        email: "fernanda.rocha@email.com",
        interesse: "alugar",
        valor: "3500",
        status: "novo",
        observacoes: "Procurando apartamento"
      }
    ]

    console.log("Criando clientes de teste...")
    
    for (const cliente of clientesTeste) {
      await dbRun(
        `INSERT INTO clientes (nome, telefone, email, interesse, valor, status, observacoes, data, usuario_id, criado_em, atualizado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), NULL, datetime('now'), datetime('now'))`,
        [cliente.nome, cliente.telefone, cliente.email, cliente.interesse, cliente.valor, cliente.status, cliente.observacoes]
      )
      console.log(`✓ Cliente "${cliente.nome}" criado`)
    }

    const todos = await dbQuery("SELECT COUNT(*) as count FROM clientes")
    console.log(`\n✓ Total de clientes no banco: ${todos.rows[0]?.count || 0}`)
    console.log("✓ Clientes de teste criados com sucesso!")
    
  } catch (error) {
    console.error("❌ Erro ao criar clientes:", error.message)
  }
}

criarClientesTeste()
