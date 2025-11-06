/**
 * Script para inicializar o banco de dados MySQL
 * Cria as tabelas necessárias para o sistema de aprendizado
 */

import * as tradeDB from './database.js';

async function initializeDatabase() {
  console.log('[Init] Iniciando criação de tabelas no MySQL...');
  
  try {
    await tradeDB.createTables();
    console.log('[Init] ✅ Banco de dados inicializado com sucesso!');
    console.log('[Init] Tabelas criadas:');
    console.log('[Init]   - trades (40+ campos)');
    console.log('[Init]   - market_snapshots');
    process.exit(0);
  } catch (error) {
    console.error('[Init] ❌ Erro ao inicializar banco:', error);
    process.exit(1);
  }
}

initializeDatabase();
