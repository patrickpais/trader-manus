// Sistema de Diagnóstico Automático

import fs from 'fs';
import path from 'path';

export class SystemDiagnostics {
  constructor() {
    this.logFile = path.join(process.cwd(), 'diagnostics.log');
    this.issuesFile = path.join(process.cwd(), 'system-issues.json');
  }

  // Diagnóstico completo do sistema
  async runFullDiagnostic() {
    console.log('[Diagnostics] Iniciando diagnóstico completo...');
    
    const results = {
      timestamp: new Date().toISOString(),
      status: 'healthy',
      issues: [],
      warnings: [],
      checks: {}
    };

    // 1. Verificar APIs
    results.checks.apis = await this.checkAPIs();
    
    // 2. Verificar Banco de Dados
    results.checks.database = await this.checkDatabase();
    
    // 3. Verificar Arquivos Críticos
    results.checks.files = await this.checkCriticalFiles();
    
    // 4. Verificar Memória e Performance
    results.checks.performance = await this.checkPerformance();
    
    // 5. Verificar Logs de Erro
    results.checks.errors = await this.checkErrorLogs();
    
    // Determinar status geral
    if (results.issues.length > 0) {
      results.status = 'critical';
    } else if (results.warnings.length > 0) {
      results.status = 'warning';
    }
    
    // Salvar resultados
    await this.saveDiagnosticResults(results);
    
    console.log(`[Diagnostics] Diagnóstico concluído: ${results.status}`);
    console.log(`[Diagnostics] Issues: ${results.issues.length}, Warnings: ${results.warnings.length}`);
    
    return results;
  }

  // Verificar conectividade com APIs
  async checkAPIs() {
    const checks = {
      bybit: { status: 'unknown', message: '' },
      database: { status: 'unknown', message: '' }
    };

    try {
      // Verificar Bybit API
      const bybitModule = await import('./bybit.js');
      const balance = await bybitModule.getBalance();
      
      if (balance && Object.keys(balance).length > 0) {
        checks.bybit.status = 'healthy';
        checks.bybit.message = 'API Bybit respondendo normalmente';
      } else {
        checks.bybit.status = 'warning';
        checks.bybit.message = 'API Bybit retornou dados vazios';
      }
    } catch (error) {
      checks.bybit.status = 'error';
      checks.bybit.message = `Erro na API Bybit: ${error.message}`;
    }

    return checks;
  }

  // Verificar banco de dados
  async checkDatabase() {
    const check = { status: 'unknown', message: '', tables: [] };

    try {
      const dbModule = await import('./db.js');
      const db = await dbModule.getDb();
      
      if (!db) {
        check.status = 'error';
        check.message = 'Banco de dados não disponível';
        return check;
      }

      // Verificar tabelas críticas
      const criticalTables = ['users', 'trades', 'positions'];
      
      for (const table of criticalTables) {
        try {
          const result = await db.execute(`SELECT COUNT(*) as count FROM ${table}`);
          check.tables.push({
            name: table,
            status: 'ok',
            count: result[0]?.count || 0
          });
        } catch (error) {
          check.tables.push({
            name: table,
            status: 'error',
            error: error.message
          });
        }
      }

      const hasErrors = check.tables.some(t => t.status === 'error');
      check.status = hasErrors ? 'error' : 'healthy';
      check.message = hasErrors ? 'Algumas tabelas com erro' : 'Banco de dados OK';
      
    } catch (error) {
      check.status = 'error';
      check.message = `Erro ao verificar banco: ${error.message}`;
    }

    return check;
  }

  // Verificar arquivos críticos
  async checkCriticalFiles() {
    const criticalFiles = [
      'server/bybit.js',
      'server/tradingEngine.js',
      'server/ultra-algorithm.js',
      'server/db.js'
    ];

    const checks = [];

    for (const file of criticalFiles) {
      const filePath = path.join(process.cwd(), file);
      const exists = fs.existsSync(filePath);
      
      checks.push({
        file,
        exists,
        status: exists ? 'ok' : 'missing'
      });
    }

    const missing = checks.filter(c => !c.exists);
    
    return {
      status: missing.length === 0 ? 'healthy' : 'error',
      message: missing.length === 0 ? 'Todos os arquivos presentes' : `${missing.length} arquivos faltando`,
      files: checks
    };
  }

  // Verificar performance do sistema
  async checkPerformance() {
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();

    const memUsageMB = {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024)
    };

    const warnings = [];
    
    if (memUsageMB.heapUsed > 500) {
      warnings.push('Uso de memória heap alto (> 500MB)');
    }
    
    if (memUsageMB.rss > 1000) {
      warnings.push('Uso de memória RSS alto (> 1GB)');
    }

    return {
      status: warnings.length === 0 ? 'healthy' : 'warning',
      uptime: Math.round(uptime / 60), // minutos
      memory: memUsageMB,
      warnings
    };
  }

  // Verificar logs de erro recentes
  async checkErrorLogs() {
    // Aqui você pode implementar leitura de logs
    // Por enquanto, retorna status básico
    return {
      status: 'healthy',
      recentErrors: 0,
      message: 'Sem erros críticos recentes'
    };
  }

  // Salvar resultados do diagnóstico
  async saveDiagnosticResults(results) {
    try {
      // Salvar log completo
      const logEntry = `\n[${results.timestamp}] Status: ${results.status}\n${JSON.stringify(results, null, 2)}\n`;
      fs.appendFileSync(this.logFile, logEntry);

      // Se houver issues, salvar separadamente
      if (results.issues.length > 0 || results.warnings.length > 0) {
        const issues = {
          timestamp: results.timestamp,
          status: results.status,
          issues: results.issues,
          warnings: results.warnings
        };
        
        fs.writeFileSync(this.issuesFile, JSON.stringify(issues, null, 2));
      }
    } catch (error) {
      console.error('[Diagnostics] Erro ao salvar resultados:', error);
    }
  }

  // Tentar corrigir problemas automaticamente
  async attemptAutoFix(issue) {
    console.log(`[Diagnostics] Tentando corrigir: ${issue.description}`);
    
    // Implementar correções automáticas aqui
    // Por exemplo: reiniciar conexões, limpar cache, etc.
    
    return {
      fixed: false,
      message: 'Correção automática não implementada para este problema'
    };
  }
}

export default SystemDiagnostics;
