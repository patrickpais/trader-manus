import nodemailer from 'nodemailer';

const emailConfig = {
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
};

let transporter = null;

function initializeEmailTransporter() {
  if (!transporter && process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
    transporter = nodemailer.createTransport(emailConfig);
  }
  return transporter;
}

const CREDIT_LIMITS = {
  critical: 5,
  low: 20,
  warning: 50
};

const notificationHistory = new Map();

async function sendCreditAlert(userEmail, creditLevel, status) {
  try {
    const transporter = initializeEmailTransporter();

    if (!transporter) {
      console.log('Email não configurado, usando console apenas');
      console.warn(`ALERTA DE CRÉDITOS: ${userEmail} - ${status}`);
      return { success: false, reason: 'Email não configurado' };
    }

    const subject = `⚠️ Trader-Manus: Créditos ${status}`;
    
    let htmlContent = '';
    let textColor = '';

    if (status === 'CRÍTICOS') {
      textColor = '#d32f2f';
      htmlContent = `
        <h2 style="color: ${textColor};">🚨 ALERTA CRÍTICO: Créditos Insuficientes!</h2>
        <p>Seus créditos no Trader-Manus estão <strong>CRÍTICOS</strong>.</p>
        <p><strong>Créditos Restantes:</strong> ${creditLevel}</p>
        <p style="color: red; font-weight: bold;">O sistema pode parar de operar a qualquer momento!</p>
        <p><strong>Ação Necessária:</strong> Renove seus créditos imediatamente.</p>
      `;
    } else if (status === 'BAIXOS') {
      textColor = '#f57c00';
      htmlContent = `
        <h2 style="color: ${textColor};">⚠️ AVISO: Créditos Baixos</h2>
        <p>Seus créditos no Trader-Manus estão <strong>BAIXOS</strong>.</p>
        <p><strong>Créditos Restantes:</strong> ${creditLevel}</p>
        <p>Recomendamos renovar seus créditos em breve para evitar interrupções.</p>
        <p><strong>Custo Estimado/Mês:</strong> 12-15 créditos</p>
      `;
    } else if (status === 'AVISO') {
      textColor = '#fbc02d';
      htmlContent = `
        <h2 style="color: ${textColor};">ℹ️ Informação: Créditos em Aviso</h2>
        <p>Seus créditos no Trader-Manus estão em nível de aviso.</p>
        <p><strong>Créditos Restantes:</strong> ${creditLevel}</p>
        <p>Você ainda tem tempo, mas considere renovar em breve.</p>
      `;
    }

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: userEmail,
      subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          ${htmlContent}
          <hr style="margin: 20px 0;">
          <p><strong>Dashboard:</strong> <a href="https://trader-manus-production.up.railway.app/">Acessar Painel</a></p>
          <p><strong>Renovar Créditos:</strong> <a href="https://manus.im/dashboard/billing">Ir para Billing</a></p>
          <hr style="margin: 20px 0;">
          <p style="font-size: 12px; color: #666;">
            Este é um email automático do Trader-Manus. 
            Não responda este email.
          </p>
        </div>
      `,
      text: `Alerta de Créditos: ${status}\nCréditos Restantes: ${creditLevel}`
    };

    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error('Erro ao enviar email de alerta:', error);
    return { success: false, error: error.message };
  }
}

async function sendCreditAlertSMS(phoneNumber, creditLevel, status) {
  try {
    if (!process.env.TWILIO_ACCOUNT_SID) {
      console.log('SMS não configurado');
      return { success: false, reason: 'SMS não configurado' };
    }

    // Implementar com Twilio quando necessário
    return { success: false, reason: 'SMS não implementado' };
  } catch (error) {
    console.error('Erro ao enviar SMS:', error);
    return { success: false, error: error.message };
  }
}

async function monitorCredits(currentCredits, userEmail, userPhone = null) {
  const notificationKey = `${userEmail}-${currentCredits}`;
  const lastNotification = notificationHistory.get(userEmail);

  if (lastNotification && lastNotification.level === getCurrentLevel(currentCredits)) {
    return { status: 'skipped', reason: 'Notificação já enviada para este nível' };
  }

  let status = null;
  let shouldNotify = false;

  if (currentCredits <= CREDIT_LIMITS.critical) {
    status = 'CRÍTICOS';
    shouldNotify = true;
  } else if (currentCredits <= CREDIT_LIMITS.low) {
    status = 'BAIXOS';
    shouldNotify = true;
  } else if (currentCredits <= CREDIT_LIMITS.warning) {
    status = 'AVISO';
    shouldNotify = true;
  }

  if (shouldNotify) {
    const emailResult = await sendCreditAlert(userEmail, currentCredits, status);

    let smsResult = { success: false };
    if (userPhone) {
      smsResult = await sendCreditAlertSMS(userPhone, currentCredits, status);
    }

    notificationHistory.set(userEmail, {
      level: status,
      credits: currentCredits,
      timestamp: new Date(),
      emailSent: emailResult.success,
      smsSent: smsResult.success
    });

    return {
      status: 'notified',
      level: status,
      emailSent: emailResult.success,
      smsSent: smsResult.success
    };
  }

  return { status: 'ok', credits: currentCredits };
}

function getCurrentLevel(credits) {
  if (credits <= CREDIT_LIMITS.critical) return 'critical';
  if (credits <= CREDIT_LIMITS.low) return 'low';
  if (credits <= CREDIT_LIMITS.warning) return 'warning';
  return 'ok';
}

function estimateMonthlyCost(features = {}) {
  let cost = 0;

  cost += 12;

  if (features.newsAnalysis) {
    cost += 3;
  }

  if (features.socialAnalysis) {
    cost += 5;
  }

  if (features.smsAlerts) {
    cost += 2;
  }

  if (features.advancedAnalysis) {
    cost += 3;
  }

  return cost;
}

function calculateDaysRemaining(currentCredits, features = {}) {
  const monthlyCost = estimateMonthlyCost(features);
  const dailyCost = monthlyCost / 30;
  const daysRemaining = Math.floor(currentCredits / dailyCost);

  return {
    daysRemaining,
    monthlyCost,
    dailyCost: dailyCost.toFixed(2),
    warningDay: Math.floor(CREDIT_LIMITS.warning / dailyCost)
  };
}

export default {
  monitorCredits,
  sendCreditAlert,
  sendCreditAlertSMS,
  getCurrentLevel,
  estimateMonthlyCost,
  calculateDaysRemaining,
  CREDIT_LIMITS,
  initializeEmailTransporter
};
