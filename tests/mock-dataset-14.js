/**
 * tests/mock-dataset-14.js — twelfth mock wave (+36 samples, EN/PT/ES).
 * Broadens every category against the tuned reference-phrase set: more
 * outlet/promo/order rules, a second EN is_reply → news tree path, an
 * ads-marker tree path, and ES/PT embedding depth for work, social, finance,
 * job-search, newsletters, spam-trash and uncategorized.
 */
const MOCK_EMAILS_14 = [
  // ─── NEWS — rule tier ──────────────────────────────────────────
  { email: 'contato@girodamanha.com.br', name: 'Giro da Manhã', domain: 'girodamanha.com.br', subject: 'As manchetes de hoje para começar o dia', snippet: 'Leia em 5 minutos.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 4, bodyLength: 600, attachmentNames: [], userLabels: [], expected: 'news', lang: 'pt', tier: 'rule' },
  { email: 'alerts@pulsenews.press', name: 'Pulse Report', domain: 'pulsenews.press', subject: 'Breaking news: city council approves budget', snippet: 'What it means for you.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 620, attachmentNames: [], userLabels: [], expected: 'news', lang: 'en', tier: 'rule' },
  { email: 'redaccion@elvigia.com', name: 'El Vigía', domain: 'elvigia.com', subject: 'Ultimas noticias: varias calles cerradas', snippet: 'Mapa del corte.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 580, attachmentNames: [], userLabels: [], expected: 'news', lang: 'es', tier: 'rule' },
  // ─── NEWS — tree tier: EN is_reply path ────────────────────────
  { email: 'reader2@newsdesk.co', name: 'News Reader', domain: 'newsdesk.co', subject: 'Re: your evening headlines', snippet: 'Sharing with the group.', bodyScan: 'news alert: developing coverage inside', toCount: 0, ccCount: 0, threadMsgCount: 2, linkCount: 3, bodyLength: 690, attachmentNames: [], userLabels: [], expected: 'news', lang: 'en', tier: 'tree' },
  // ─── NEWS — embedding tier ─────────────────────────────────────
  { email: 'redacao@tribunapopular.com.br', name: 'Tribuna Popular', domain: 'tribunapopular.com.br', subject: 'Reportagem especial: os bastidores da apuração', snippet: 'Cobertura completa ao vivo.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 5, bodyLength: 800, attachmentNames: [], userLabels: [], expected: 'news', lang: 'pt', tier: 'embedding' },

  // ─── ADS — rule tier ───────────────────────────────────────────
  { email: 'clube@cupomdasemana.com.br', name: 'Cupom da Semana', domain: 'cupomdasemana.com.br', subject: 'Cupom de desconto para assinantes', snippet: 'Válido por 7 dias.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 9, bodyLength: 1250, attachmentNames: [], userLabels: [], expected: 'ads', lang: 'pt', tier: 'rule' },
  { email: 'rebajas@modasur.es', name: 'ModaSur', domain: 'modasur.es', subject: 'Descuento del 30% en abrigos', snippet: 'Solo esta semana.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 10, bodyLength: 1280, attachmentNames: [], userLabels: [], expected: 'ads', lang: 'es', tier: 'rule' },
  { email: 'sale@homekits.store', name: 'HomeKits', domain: 'homekits.store', subject: 'Spring refresh: up to 35% off furniture', snippet: 'Ends when the timer hits zero.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 11, bodyLength: 1300, attachmentNames: [], userLabels: [], expected: 'ads', lang: 'en', tier: 'rule' },
  // ─── ADS — tree tier: discount marker in the body scan ────────
  { email: 'members@fieldstonesupply.com', name: 'Fieldstone Supply', domain: 'fieldstonesupply.com', subject: 'Members sale starts now', snippet: 'Preview the flyer.', bodyScan: 'exclusive member pricing — discount applied at checkout, limited time', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 8, bodyLength: 1320, attachmentNames: [], userLabels: [], expected: 'ads', lang: 'en', tier: 'tree' },
  // ─── ADS — embedding tier ──────────────────────────────────────
  { email: 'gear@harborgoods.com', name: 'Harbor Goods', domain: 'harborgoods.com', subject: 'Weekend savings on outdoor gear', snippet: 'Best deals end Sunday night.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 10, bodyLength: 1260, attachmentNames: [], userLabels: [], expected: 'ads', lang: 'en', tier: 'embedding' },

  // ─── SHOPPING — rule tier: remaining marketplace domains ──────
  { email: 'orders@shopee.com', name: 'Shopee Global', domain: 'shopee.com', subject: 'Your order has been confirmed', snippet: 'Track it in the app.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 520, attachmentNames: [], userLabels: [], expected: 'shopping', lang: 'en', tier: 'rule' },
  { email: 'aviso@amazon.com.br', name: 'Amazon BR', domain: 'amazon.com.br', subject: 'Seu pedido saiu para entrega', snippet: 'Chega hoje.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 505, attachmentNames: [], userLabels: [], expected: 'shopping', lang: 'pt', tier: 'rule' },
  // ─── SHOPPING — embedding tier (unknown stores) ───────────────
  { email: 'loja@floriculturacity.com.br', name: 'Floricultura City', domain: 'floriculturacity.com.br', subject: 'O arranjo foi enviado com carinho', snippet: 'Acompanhe a entrega.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 2, bodyLength: 480, attachmentNames: [], userLabels: [], expected: 'shopping', lang: 'pt', tier: 'embedding' },
  { email: 'track@grocerygo.app', name: 'GroceryGo', domain: 'grocerygo.app', subject: 'Order update: your basket is packed', snippet: 'Track the delivery inside.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 495, attachmentNames: [], userLabels: [], expected: 'shopping', lang: 'en', tier: 'embedding' },

  // ─── WORK — rule tier: remaining SaaS domains ─────────────────
  { email: 'tasks@asana.com', name: 'Asana', domain: 'asana.com', subject: 'Task due today: publish the report', snippet: 'Open in Asana.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 2, bodyLength: 360, attachmentNames: [], userLabels: [], expected: 'work', lang: 'en', tier: 'rule' },
  { email: 'board@trello.com', name: 'Trello', domain: 'trello.com', subject: 'Card moved to Doing', snippet: 'See the board.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 2, bodyLength: 340, attachmentNames: [], userLabels: [], expected: 'work', lang: 'en', tier: 'rule' },
  { email: 'invite@zoom.us', name: 'Zoom', domain: 'zoom.us', subject: 'Meeting with the design team at 3pm', snippet: 'Join link inside.', bodyScan: '', toCount: 3, ccCount: 0, threadMsgCount: 1, linkCount: 2, bodyLength: 380, attachmentNames: [], userLabels: [], expected: 'work', lang: 'en', tier: 'rule' },
  // ─── WORK — embedding tier (PT client mail) ───────────────────
  { email: 'ti@coordenacaoti.com.br', name: 'Coordenação TI', domain: 'coordenacaoti.com.br', subject: 'Retrospectiva do projeto na quinta', snippet: 'Pauta e agenda no board.', bodyScan: '', toCount: 2, ccCount: 0, threadMsgCount: 1, linkCount: 1, bodyLength: 420, attachmentNames: [], userLabels: [], expected: 'work', lang: 'pt', tier: 'embedding' },

  // ─── SOCIAL — rule tier + embedding ───────────────────────────
  { email: 'searches@linkedin.com', name: 'LinkedIn', domain: 'linkedin.com', subject: 'Your profile appeared in 12 searches this week', snippet: 'Who is viewing you.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 4, bodyLength: 560, attachmentNames: [], userLabels: [], expected: 'social', lang: 'en', tier: 'rule' },
  { email: 'tags@wavechat.io', name: 'WaveChat', domain: 'wavechat.io', subject: 'You were tagged in a photo', snippet: 'See the picture.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 320, attachmentNames: [], userLabels: [], expected: 'social', lang: 'en', tier: 'embedding' },
  { email: 'perfil@redeamigos.com.br', name: 'Rede Amigos', domain: 'redeamigos.com.br', subject: 'Novos comentarios na sua publicacao', snippet: 'Responda agora.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 300, attachmentNames: [], userLabels: [], expected: 'social', lang: 'pt', tier: 'embedding' },

  // ─── FINANCE — rule + embedding ───────────────────────────────
  { email: 'avisos@cartaoverde.com.br', name: 'Cartão Verde', domain: 'cartaoverde.com.br', subject: 'Pagamento em aberto: debito automatico', snippet: 'Autorize hoje.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 2, bodyLength: 440, attachmentNames: [], userLabels: [], expected: 'finance', lang: 'pt', tier: 'embedding' },
  { email: 'prestamo@prestamofacil.es', name: 'Préstamo Fácil', domain: 'prestamofacil.es', subject: 'Su pago fue recibido gracias', snippet: 'Sin acciones necesarias.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 1, bodyLength: 420, attachmentNames: [], userLabels: [], expected: 'finance', lang: 'es', tier: 'embedding' },
  { email: 'billing@mercurybank.example', name: 'Mercury Bank', domain: 'mercurybank.example', subject: 'Your monthly statement is ready', snippet: 'View in the app.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 2, bodyLength: 430, attachmentNames: [], userLabels: [], expected: 'finance', lang: 'en', tier: 'rule' },

  // ─── JOB-SEARCH — rule + tree (ES branch) + embedding ─────────
  { email: 'alerts@careerwave.io', name: 'CareerWave', domain: 'careerwave.io', subject: 'Job Alert: 20 companies hiring this week', snippet: 'Apply in one click.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 5, bodyLength: 650, attachmentNames: [], userLabels: [], expected: 'job-search', lang: 'en', tier: 'rule' },
  { email: 'ofertas@tecnoempleo2.es', name: 'TecnoEmpleo', domain: 'tecnoempleo2.es', subject: 'Nueva vacante: convocatoria tecnico de soporte', snippet: 'Nuestro equipo debe revisar estos datos.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 4, bodyLength: 640, attachmentNames: [], userLabels: [], expected: 'job-search', lang: 'es', tier: 'tree' },
  { email: 'agenda@devflow.com.br', name: 'DevFlow', domain: 'devflow.com.br', subject: 'Entrevista marcada: dev python na quinta', snippet: 'Confirme sua presenca.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 2, bodyLength: 580, attachmentNames: [], userLabels: [], expected: 'job-search', lang: 'pt', tier: 'embedding' },

  // ─── NEWSLETTERS — rule + embedding ───────────────────────────
  { email: 'digest@dataweekly.io', name: 'Data Weekly', domain: 'dataweekly.io', subject: 'Your data digest: issue 12', snippet: 'Charts and analysis.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 7, bodyLength: 1200, attachmentNames: [], userLabels: [], expected: 'newsletters', lang: 'en', tier: 'rule' },
  { email: 'editores@editores.com.br', name: 'Seleção dos Editores', domain: 'editores.com.br', subject: 'Seleção semanal dos editores', snippet: 'Boa leitura!', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 6, bodyLength: 1150, attachmentNames: [], userLabels: [], expected: 'newsletters', lang: 'pt', tier: 'embedding' },
  { email: 'serie@seriedigital.es', name: 'Serie Digital', domain: 'seriedigital.es', subject: 'Capítulo 5 de nuestra serie', snippet: 'Nuevos capitulos cada viernes.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 5, bodyLength: 1100, attachmentNames: [], userLabels: [], expected: 'newsletters', lang: 'es', tier: 'embedding' },

  // ─── SPAM-TRASH — embedding tier: phishing / golpe / lotto ────
  { email: 'cadastro@cadastro-falso.click', name: 'Cadastro Falso', domain: 'cadastro-falso.click', subject: 'Verificacao urgente da sua conta bancaria', snippet: 'Evite o bloqueio.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 2, bodyLength: 610, attachmentNames: [], userLabels: [], expected: 'spam-trash', lang: 'pt', tier: 'embedding' },
  { email: 'sorteo@sorteo-express.click', name: 'Sorteo Express', domain: 'sorteo-express.click', subject: 'Reclama tu premio del sorteo ahora', snippet: 'Ultimo dia.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 2, bodyLength: 600, attachmentNames: [], userLabels: [], expected: 'spam-trash', lang: 'es', tier: 'embedding' },
  { email: 'wins@megalotto.online', name: 'MegaLotto', domain: 'megalotto.online', subject: 'Lottery winner: your cash prize is waiting', snippet: 'Claim within 48 hours.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 2, bodyLength: 615, attachmentNames: [], userLabels: [], expected: 'spam-trash', lang: 'en', tier: 'embedding' },

  // ─── UNCATEGORIZED — long tail ────────────────────────────────
  { email: 'ferias@academiacentral.com.br', name: 'Academia Central', domain: 'academiacentral.com.br', subject: 'Horario de ferias da academia', snippet: 'Retomamos em janeiro.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 0, bodyLength: 150, attachmentNames: [], userLabels: [], expected: 'uncategorized', lang: 'pt', tier: 'embedding' },
  { email: 'aviso@neighborpatch.org', name: 'Neighbor Patch', domain: 'neighborpatch.org', subject: 'Lost cat near Elm street', snippet: 'Please call tonight.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 0, bodyLength: 180, attachmentNames: [], userLabels: [], expected: 'uncategorized', lang: 'en', tier: 'embedding' },
  { email: 'taller@tallermecanico.es', name: 'Taller Mecánico', domain: 'tallermecanico.es', subject: 'Su vehículo está listo', snippet: 'Puede pasar a recogerlo.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 1, bodyLength: 240, attachmentNames: [], userLabels: [], expected: 'uncategorized', lang: 'es', tier: 'embedding' },
];

if (typeof module !== 'undefined') module.exports = { MOCK_EMAILS_14 };
