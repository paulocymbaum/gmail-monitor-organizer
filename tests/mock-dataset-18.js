/**
 * tests/mock-dataset-18.js — décimo-sexto mock wave (+21 amostras, pt/es/en):
 * as 4 categorias novas `servicos`, `governo`, `viagens` e `saude` — rule-tier
 * (domínios/keywords) e embedding-tier, mais precedência (finance 7 vence
 * servicos? não: servicos 5 antes de finance 7 — alertas de conta vencem).
 */
const MOCK_EMAILS_18 = [
  // ─── SERVICOS — rule tier: contas digitais & SaaS ─────────────
  { email: 'noreply@stripo.email', name: 'Stripo', domain: 'stripo.email', subject: 'Final Notice: Account deletion in 24 hours', snippet: 'Act now to keep your data.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 620, attachmentNames: [], userLabels: [], expected: 'servicos', lang: 'en', tier: 'rule' },
  { email: 'notify@notifications.stripo.email', name: 'Stripo', domain: 'notifications.stripo.email', subject: 'Action required: 7 days until account deletion ⏳', snippet: 'Don\'t lose your templates.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 630, attachmentNames: [], userLabels: [], expected: 'servicos', lang: 'en', tier: 'rule' },
  { email: 'team@duocards.com', name: 'DuoCards', domain: 'duocards.com', subject: '🚨 Last chance: your DuoCards account will be deleted in 7 days', snippet: 'Save your decks.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 2, bodyLength: 610, attachmentNames: [], userLabels: [], expected: 'servicos', lang: 'en', tier: 'rule' },
  { email: 'me@accounts.google.com', name: 'Google', domain: 'accounts.google.com', subject: 'Alerta de segurança', snippet: 'Novo acesso detectado.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 2, bodyLength: 380, attachmentNames: [], userLabels: [], expected: 'servicos', lang: 'pt', tier: 'rule' },
  { email: 'you@po.atlassian.net', name: 'Jira', domain: 'po.atlassian.net', subject: 'You\'re now on Jira Free', snippet: 'Explore seu plano.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 420, attachmentNames: [], userLabels: [], expected: 'servicos', lang: 'en', tier: 'rule' },
  // ─── SERVICOS — embedding tier: update de produto que você usa ─
  { email: 'news@whatsnew.sider.ai', name: 'Sider', domain: 'whatsnew.sider.ai', subject: 'Service update: what changed this month', snippet: 'Our latest changelog.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 4, bodyLength: 560, attachmentNames: [], userLabels: [], expected: 'servicos', lang: 'en', tier: 'embedding' },

  // ─── GOVERNO — rule tier: gov.br / Receita / prefeitura / MEI ──
  { email: 'nao-responda@meumeidigital.com.br', name: 'MEI Digital', domain: 'meumeidigital.com.br', subject: 'Paulo, perdão de dívidas MEI.', snippet: 'Regularize seu CNPJ.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 540, attachmentNames: [], userLabels: [], expected: 'governo', lang: 'pt', tier: 'rule' },
  { email: 'malha@receita.ficticia.br', name: 'Receita Federal', domain: 'receita.ficticia.br', subject: 'IRPF 2026: declare seu imposto de renda', snippet: 'Prazo até maio.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 560, attachmentNames: [], userLabels: [], expected: 'governo', lang: 'pt', tier: 'rule' },
  { email: 'avisos@gov-br-alertas.example', name: 'Gov.br', domain: 'gov-br-alertas.example', subject: 'gov.br: atualize seu cadastro', snippet: 'Nível prata disponível.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 520, attachmentNames: [], userLabels: [], expected: 'governo', lang: 'pt', tier: 'rule' },
  { email: 'imprensa@prefeitura.example.gov', name: 'Prefeitura', domain: 'prefeitura.example.gov', subject: 'Prefeitura anuncia novo horário de atendimento', snippet: 'Serviços ao munícipe.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 2, bodyLength: 480, attachmentNames: [], userLabels: [], expected: 'governo', lang: 'pt', tier: 'rule' },
  // ─── GOVERNO — embedding tier (trámite es) ─────────────────────
  { email: 'citas@gobierno-es.example', name: 'Gobierno ES', domain: 'gobierno-es.example', subject: 'Trámite gubernamental: cita previa requerida', snippet: 'Solicite su cita.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 500, attachmentNames: [], userLabels: [], expected: 'governo', lang: 'es', tier: 'embedding' },

  // ─── VIAGENS — rule tier: OTA domains + keywords ──────────────
  { email: 'confirmacao@booking.com', name: 'Booking.com', domain: 'booking.com', subject: 'Your booking confirmation — Hotel Aurora', snippet: 'Boa estadia.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 560, attachmentNames: [], userLabels: [], expected: 'viagens', lang: 'en', tier: 'rule' },
  { email: 'auto@airbnb.com', name: 'Airbnb', domain: 'airbnb.com', subject: 'Your next trip: welcome to Airbnb', snippet: 'Sua próxima estadia.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 540, attachmentNames: [], userLabels: [], expected: 'viagens', lang: 'pt', tier: 'rule' },
  { email: 'reserva@hotelbr.example', name: 'Hotel BR', domain: 'hotelbr.example', subject: 'Sua reserva no hotel está confirmada', snippet: 'Chegue após 14h.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 2, bodyLength: 460, attachmentNames: [], userLabels: [], expected: 'viagens', lang: 'pt', tier: 'rule' },
  { email: 'voo@compaerea.example', name: 'Compaérea', domain: 'compaerea.example', subject: 'Check-in online disponível: voo GOL 1234', snippet: 'Embarque às 14h20.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 470, attachmentNames: [], userLabels: [], expected: 'viagens', lang: 'pt', tier: 'rule' },
  // ─── VIAGENS — embedding tier ─────────────────────────────────
  { email: 'viaje@otapacote.example', name: 'OTA Pacotes', domain: 'otapacote.example', subject: 'Su vuelo sale mañana, revise su reserva', snippet: 'Todo listo para viajar.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 510, attachmentNames: [], userLabels: [], expected: 'viagens', lang: 'es', tier: 'embedding' },
  { email: 'deals@flightdeals.example', name: 'Flight Deals', domain: 'flightdeals.example', subject: 'Flight deal: Lisbon round-trip vacation package', snippet: 'Book now and save.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 5, bodyLength: 640, attachmentNames: [], userLabels: [], expected: 'viagens', lang: 'en', tier: 'embedding' },

  // ─── SAUDE — rule tier: consultas e plano ─────────────────────
  { email: 'agenda@clinica.example', name: 'Clínica Vida', domain: 'clinica.example', subject: 'Consulta marcada: Dr. Silva, cardiologia', snippet: 'Chegue 15 min antes.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 2, bodyLength: 420, attachmentNames: [], userLabels: [], expected: 'saude', lang: 'pt', tier: 'rule' },
  { email: 'plano@segurosaude.example', name: 'Seguro Saúde', domain: 'segurosaude.example', subject: 'Plano de saúde: reembolso disponível', snippet: 'Solicite pelo app.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 430, attachmentNames: [], userLabels: [], expected: 'saude', lang: 'pt', tier: 'rule' },
  // ─── SAUDE — embedding tier ───────────────────────────────────
  { email: 'lab@laboratorio.example', name: 'Laboratório', domain: 'laboratorio.example', subject: 'Exames laboratoriais: seus resultados saíram', snippet: 'Consulte o portal.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 450, attachmentNames: [], userLabels: [], expected: 'saude', lang: 'pt', tier: 'embedding' },
  { email: 'results@medlab.example', name: 'MedLab', domain: 'medlab.example', subject: 'Your lab results are ready', snippet: 'View in the portal.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 440, attachmentNames: [], userLabels: [], expected: 'saude', lang: 'en', tier: 'embedding' },
];

if (typeof module !== 'undefined') module.exports = { MOCK_EMAILS_18 };
