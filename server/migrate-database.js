/**
 * Script de migração - Adiciona colunas de Machine Learning na tabela trades
 */

import mysql from 'mysql2/promise';

async function migrate() {
  console.log('[Migration] Conectando ao banco...');
  
  const connection = await mysql.createConnection({
    host: 'gateway02.us-east-1.prod.aws.tidbcloud.com',
    port: 4000,
    user: 'i4eWuXmqdJD31yc.root',
    password: 'v4Q7qqU8oYA5g46PKkCW',
    database: 'Cp5JEc3tFKKzfsKUJ75GgH',
    ssl: {
      rejectUnauthorized: true
    }
  });
  
  try {
    console.log('[Migration] ✅ Conectado!');
    
    // Adicionar colunas de indicadores de entrada
    console.log('[Migration] Adicionando colunas de entrada...');
    
    const entryColumns = [
      'ADD COLUMN IF NOT EXISTS entry_rsi DECIMAL(10, 4)',
      'ADD COLUMN IF NOT EXISTS entry_macd DECIMAL(20, 10)',
      'ADD COLUMN IF NOT EXISTS entry_macd_signal DECIMAL(20, 10)',
      'ADD COLUMN IF NOT EXISTS entry_volume_ratio DECIMAL(10, 4)',
      'ADD COLUMN IF NOT EXISTS entry_trend VARCHAR(20)',
      'ADD COLUMN IF NOT EXISTS entry_volatility DECIMAL(20, 10)',
      'ADD COLUMN IF NOT EXISTS entry_confidence DECIMAL(10, 4)',
      'ADD COLUMN IF NOT EXISTS entry_score DECIMAL(10, 4)',
      'ADD COLUMN IF NOT EXISTS entry_reasons TEXT',
    ];
    
    for (const col of entryColumns) {
      try {
        await connection.execute(`ALTER TABLE trades ${col}`);
        console.log(`[Migration] ✅ ${col.split(' ')[4]} adicionada`);
      } catch (err) {
        if (err.code === 'ER_DUP_FIELDNAME') {
          console.log(`[Migration] ⏭️  ${col.split(' ')[4]} já existe`);
        } else {
          console.error(`[Migration] ❌ Erro ao adicionar ${col.split(' ')[4]}:`, err.message);
        }
      }
    }
    
    // Adicionar colunas de indicadores de saída
    console.log('[Migration] Adicionando colunas de saída...');
    
    const exitColumns = [
      'ADD COLUMN IF NOT EXISTS exit_rsi DECIMAL(10, 4)',
      'ADD COLUMN IF NOT EXISTS exit_macd DECIMAL(20, 10)',
      'ADD COLUMN IF NOT EXISTS exit_macd_signal DECIMAL(20, 10)',
      'ADD COLUMN IF NOT EXISTS exit_volume_ratio DECIMAL(10, 4)',
      'ADD COLUMN IF NOT EXISTS exit_reason VARCHAR(50)',
      'ADD COLUMN IF NOT EXISTS duration_minutes INT',
    ];
    
    for (const col of exitColumns) {
      try {
        await connection.execute(`ALTER TABLE trades ${col}`);
        console.log(`[Migration] ✅ ${col.split(' ')[4]} adicionada`);
      } catch (err) {
        if (err.code === 'ER_DUP_FIELDNAME') {
          console.log(`[Migration] ⏭️  ${col.split(' ')[4]} já existe`);
        } else {
          console.error(`[Migration] ❌ Erro ao adicionar ${col.split(' ')[4]}:`, err.message);
        }
      }
    }
    
    // Adicionar colunas de tracking
    console.log('[Migration] Adicionando colunas de tracking...');
    
    const trackingColumns = [
      'ADD COLUMN IF NOT EXISTS max_profit DECIMAL(20, 8)',
      'ADD COLUMN IF NOT EXISTS max_loss DECIMAL(20, 8)',
      'ADD COLUMN IF NOT EXISTS price_history TEXT',
    ];
    
    for (const col of trackingColumns) {
      try {
        await connection.execute(`ALTER TABLE trades ${col}`);
        console.log(`[Migration] ✅ ${col.split(' ')[4]} adicionada`);
      } catch (err) {
        if (err.code === 'ER_DUP_FIELDNAME') {
          console.log(`[Migration] ⏭️  ${col.split(' ')[4]} já existe`);
        } else {
          console.error(`[Migration] ❌ Erro ao adicionar ${col.split(' ')[4]}:`, err.message);
        }
      }
    }
    
    // Criar tabela market_snapshots
    console.log('[Migration] Criando tabela market_snapshots...');
    
    try {
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS market_snapshots (
          id INT AUTO_INCREMENT PRIMARY KEY,
          trade_id INT,
          symbol VARCHAR(20) NOT NULL,
          timestamp DATETIME NOT NULL,
          price DECIMAL(20, 8) NOT NULL,
          rsi DECIMAL(10, 4),
          macd DECIMAL(20, 10),
          volume_ratio DECIMAL(10, 4),
          pnl DECIMAL(20, 8),
          
          INDEX idx_trade_id (trade_id),
          INDEX idx_timestamp (timestamp)
        )
      `);
      console.log('[Migration] ✅ Tabela market_snapshots criada');
    } catch (err) {
      if (err.code === 'ER_TABLE_EXISTS_ERROR') {
        console.log('[Migration] ⏭️  Tabela market_snapshots já existe');
      } else {
        console.error('[Migration] ❌ Erro ao criar tabela:', err.message);
      }
    }
    
    // Adicionar índices para performance
    console.log('[Migration] Adicionando índices...');
    
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_entry_confidence ON trades(entry_confidence)',
      'CREATE INDEX IF NOT EXISTS idx_pnl ON trades(pnl)',
      'CREATE INDEX IF NOT EXISTS idx_opened_at ON trades(opened_at)',
    ];
    
    for (const idx of indexes) {
      try {
        await connection.execute(idx);
        console.log(`[Migration] ✅ Índice criado`);
      } catch (err) {
        if (err.code === 'ER_DUP_KEYNAME') {
          console.log(`[Migration] ⏭️  Índice já existe`);
        } else {
          console.error(`[Migration] ❌ Erro ao criar índice:`, err.message);
        }
      }
    }
    
    console.log('[Migration] ✅ Migração concluída com sucesso!');
    
  } catch (error) {
    console.error('[Migration] ❌ Erro na migração:', error);
    throw error;
  } finally {
    await connection.end();
  }
}

migrate()
  .then(() => {
    console.log('[Migration] 🎉 Banco de dados pronto para machine learning!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[Migration] 💥 Falha na migração:', error);
    process.exit(1);
  });
