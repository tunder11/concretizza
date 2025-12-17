const http = require('http');

function login(username, password) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ username, password });
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(responseData));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function getUsuarios(token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/usuarios',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function test() {
  try {
    console.log('=== TESTE FINAL: Verificar ultimoAcesso ===\n');
    
    const loginResponse = await login('admin', '123456');
    if (!loginResponse.token) {
      console.error('Erro ao fazer login');
      return;
    }
    
    const usuarios = await getUsuarios(loginResponse.token);
    
    console.log('✓ Usuários com ultimoAcesso:');
    let todosPreenchidos = true;
    usuarios.forEach(u => {
      const temUltimoAcesso = u.ultimoAcesso && u.ultimoAcesso !== null && u.ultimoAcesso !== 'null';
      const status = temUltimoAcesso ? '✓' : '✗';
      console.log(`  ${status} ${u.nome}: ${u.ultimoAcesso || 'NULL'}`);
      if (!temUltimoAcesso) todosPreenchidos = false;
    });
    
    console.log('\n' + (todosPreenchidos ? '✓ SUCESSO: Todos os usuários têm ultimoAcesso preenchido!' : '✗ ERRO: Alguns usuários não têm ultimoAcesso'));
  } catch (error) {
    console.error('Erro:', error.message);
  }
  
  process.exit(0);
}

setTimeout(test, 3000);
