/**
 * tests/mock-dataset-9.js — seventh mock wave (+10 rule-tier samples) validating
 * the promoted rule sets: new `shopping` category (marketplace domains +
 * order/rastreamento keywords), finance bank domains + PIX, work SaaS domains
 * + PR keywords, social platform domains. All with rich fields.
 */
const MOCK_EMAILS_9 = [
  { email: 'noreply@shopee.com.br', name: 'Shopee', domain: 'shopee.com.br', subject: 'Seu pedido foi enviado — rastreio #SP4402', snippet: 'Acompanhe a entrega.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 600, attachmentNames: [], userLabels: [], expected: 'shopping', lang: 'pt', tier: 'rule' },
  { email: 'promo@shein.com', name: 'SHEIN', domain: 'shein.com', subject: 'Cupom de 15% + frete grátis hoje', snippet: 'unsubscribe', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 14, bodyLength: 1500, attachmentNames: [], userLabels: [], expected: 'shopping', lang: 'pt', tier: 'rule' },
  { email: 'no-reply@amazon.com.br', name: 'Amazon.com.br', domain: 'amazon.com.br', subject: 'Seu pedido #402-5588 foi entregue', snippet: 'Deixe sua avaliação.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 2, bodyLength: 500, attachmentNames: [], userLabels: [], expected: 'shopping', lang: 'pt', tier: 'rule' },
  { email: 'no-reply@ifood.com.br', name: 'iFood', domain: 'ifood.com.br', subject: 'Pedido confirmado — Burger King', snippet: 'Chegando em 30 min.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 2, bodyLength: 400, attachmentNames: [], userLabels: [], expected: 'shopping', lang: 'pt', tier: 'rule' },
  { email: 'no-reply@itau.com.br', name: 'Itaú', domain: 'itau.com.br', subject: 'PIX recebido — R$ 250,00', snippet: 'Comprovante disponível.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 1, bodyLength: 350, attachmentNames: [], userLabels: [], expected: 'finance', lang: 'pt', tier: 'rule' },
  { email: 'noreply@mercadopago.com.br', name: 'Mercado Pago', domain: 'mercadopago.com.br', subject: 'Extrato de junho disponível', snippet: 'Veja seus gastos.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 2, bodyLength: 450, attachmentNames: [], userLabels: [], expected: 'finance', lang: 'pt', tier: 'rule' },
  { email: 'notifications@github.com', name: 'GitHub', domain: 'github.com', subject: 'Pull request #12 ready for review', snippet: 'Code review requested.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 2, bodyLength: 550, attachmentNames: [], userLabels: ['Trabalho'], expected: 'work', lang: 'en', tier: 'rule' },
  { email: 'comments@notion.so', name: 'Notion', domain: 'notion.so', subject: 'Ana commented on the roadmap page', snippet: 'Open in Notion.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 1, bodyLength: 420, attachmentNames: [], userLabels: ['Trabalho'], expected: 'work', lang: 'en', tier: 'rule' },
  { email: 'notify@tiktok.com', name: 'TikTok', domain: 'tiktok.com', subject: 'Você tem novas curtidas', snippet: 'Veja quem curtiu.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 2, bodyLength: 280, attachmentNames: [], userLabels: [], expected: 'social', lang: 'pt', tier: 'rule' },
  { email: 'hi@mailerlite.io', name: 'MailerLite', domain: 'mailerlite.io', subject: 'Your weekly digest is ready', snippet: 'unsubscribe', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 8, bodyLength: 1200, attachmentNames: [], userLabels: [], expected: 'newsletters', lang: 'en', tier: 'rule' },
];

if (typeof module !== 'undefined') module.exports = { MOCK_EMAILS_9 };
