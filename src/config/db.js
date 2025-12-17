require("dotenv").config()
const { Pool } = require("pg")
const Database = require("better-sqlite3")
const path = require("path")

const USE_SQLITE = !process.env.DATABASE_URL
const db = USE_SQLITE ? initSQLite() : initPostgreSQL()

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

function initSQLite() {
  const dbPath = path.join(__dirname, "concretizza.db")
  const sqlite = new Database(dbPath)
  sqlite.pragma("journal_mode = WAL")
  console.log(`[${getDataSaoPaulo()}] ✓ SQLite database conectado:`, dbPath)

  return {
    isPostgres: false,
    query: (sql, params) => {
      return new Promise((resolve, reject) => {
        try {
          const convertedSQL = convertSQLiteSQL(sql)
          const isMutating = /^(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)/i.test(sql.trim())
          
          if (isMutating) {
            const stmt = sqlite.prepare(convertedSQL)
            let result
            if (params && params.length > 0) {
              result = stmt.run(...params)
            } else {
              result = stmt.run()
            }
            resolve({ rows: result, rowCount: result.changes })
          } else {
            const stmt = sqlite.prepare(convertedSQL)
            let result
            if (params && params.length > 0) {
              result = stmt.all(...params)
            } else {
              result = stmt.all()
            }
            resolve({ rows: result, rowCount: result.length })
          }
        } catch (err) {
          reject(err)
        }
      })
    },
    run: (sql, params, callback) => {
      if (typeof params === 'function') {
        callback = params
        params = []
      }
      try {
        const stmt = sqlite.prepare(convertSQLiteSQL(sql))
        let result
        if (params && params.length > 0) {
          result = stmt.run(...params)
        } else {
          result = stmt.run()
        }
        if (callback) callback(null, { lastID: result.lastInsertRowid, changes: result.changes })
      } catch (err) {
        if (callback) callback(err)
      }
    },
    get: (sql, params, callback) => {
      if (typeof params === 'function') {
        callback = params
        params = []
      }
      try {
        const stmt = sqlite.prepare(convertSQLiteSQL(sql))
        let result
        if (params && params.length > 0) {
          result = stmt.get(...params)
        } else {
          result = stmt.get()
        }
        if (callback) callback(null, result)
      } catch (err) {
        if (callback) callback(err)
      }
    },
    all: (sql, params, callback) => {
      if (typeof params === 'function') {
        callback = params
        params = []
      }
      try {
        const stmt = sqlite.prepare(convertSQLiteSQL(sql))
        let result
        if (params && params.length > 0) {
          result = stmt.all(...params)
        } else {
          result = stmt.all()
        }
        if (callback) callback(null, result)
      } catch (err) {
        if (callback) callback(err)
      }
    },
    close: () => sqlite.close()
  }
}

function convertSQLiteSQL(sql) {
  let converted = sql
  converted = converted.replace(/\$\d+/g, '?')
  converted = converted.replace(/SERIAL PRIMARY KEY/g, 'INTEGER PRIMARY KEY AUTOINCREMENT')
  converted = converted.replace(/TIMESTAMP DEFAULT CURRENT_TIMESTAMP/g, 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP')
  converted = converted.replace(/BOOLEAN/g, 'INTEGER')
  converted = converted.replace(/REFERENCES ([a-z_]+)\(([a-z_]+)\)/gi, (match, table, column) => {
    return `REFERENCES ${table}(${column})`
  })
  return converted
}

function initPostgreSQL() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  })

  pool.on('error', (err) => {
    console.error(`[${getDataSaoPaulo()}] ❌ Erro no pool PostgreSQL:`, err.message)
  })

  pool.on('connect', () => {
    console.log(`[${getDataSaoPaulo()}] ✓ PostgreSQL conectado`)
  })

  return {
    isPostgres: true,
    query: (sql, params) => pool.query(sql, params),
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
    },
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
    pool: pool
  }
}

module.exports = db
