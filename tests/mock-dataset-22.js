/**
 * tests/mock-dataset-22.js — vigésimo mock wave (+21 amostras, pt/en/es):
 * QUARTA rodada de MARCAS FAMOSAS — gaming/assinaturas e criativos:
 * Adobe, PlayStation, Epic Games, Xbox, Roblox, WhatsApp (servicos);
 * Planalto e Câmara dos Deputados (governo legislativo); TAP 🇵🇹, Hilton,
 * United, Hotels.com e Iberia 🇪🇸 (viagens); Sírio-Libanês, Kaiser, NHS 🇬🇧,
 * Pague Menos e Rede D'Or (saude); Neon 🇧🇷 (finance) e Vimeo (social).
 * Cross documentado: **promo da PlayStation Store** ("descontos") cai em `ads`
 * (keyword 4) vencendo o domínio `playstation.com` de `servicos` (5).
 */
const MOCK_EMAILS_22 = [
  // ─── SERVICOS — Adobe / PlayStation / Epic / Xbox (rule: domínio) ──────
  { email: 'no-reply@adobe.com', name: 'Adobe', domain: 'adobe.com', subject: 'Adobe ID: novo login detectado no Creative Cloud', snippet: 'Revise a atividade da conta.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 430, attachmentNames: [], userLabels: [], expected: 'servicos', lang: 'pt', tier: 'rule' },
  { email: 'noreply@playstation.com', name: 'PlayStation', domain: 'playstation.com', subject: 'PlayStation: novo acesso à sua conta PSN', snippet: 'Não foi você? Altere a senha.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 425, attachmentNames: [], userLabels: [], expected: 'servicos', lang: 'pt', tier: 'rule' },
  { email: 'help@epicgames.com', name: 'Epic Games', domain: 'epicgames.com', subject: 'Epic Games: código de segurança para entrar na conta', snippet: 'Use o código no app.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 415, attachmentNames: [], userLabels: [], expected: 'servicos', lang: 'pt', tier: 'rule' },
  { email: 'account@xbox.com', name: 'Xbox', domain: 'xbox.com', subject: 'Xbox: verifique o novo acesso à sua conta', snippet: 'Gerencie seus dispositivos.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 420, attachmentNames: [], userLabels: [], expected: 'servicos', lang: 'pt', tier: 'rule' },
  // ─── SERVICOS — Roblox / WhatsApp (embedding, domínio fora do Config) ──
  { email: 'noreply@roblox.com', name: 'Roblox', domain: 'roblox.com', subject: 'Roblox: um novo dispositivo entrou na sua conta', snippet: 'Proteja sua conta agora.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 430, attachmentNames: [], userLabels: [], expected: 'servicos', lang: 'pt', tier: 'embedding' },
  { email: 'verify@whatsapp.com', name: 'WhatsApp', domain: 'whatsapp.com', subject: 'WhatsApp: seu código de verificação é 419-283', snippet: 'Vale por 10 minutos. Não compartilhe.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 2, bodyLength: 380, attachmentNames: [], userLabels: [], expected: 'servicos', lang: 'pt', tier: 'embedding' },

  // ─── GOVERNO — Planalto / Câmara dos Deputados (rule: domínio) ────────
  { email: 'noticias@planalto.gov.br', name: 'Planalto', domain: 'planalto.gov.br', subject: 'Planalto: projeto de lei é sancionado', snippet: 'Veja os detalhes da lei.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 510, attachmentNames: [], userLabels: [], expected: 'governo', lang: 'pt', tier: 'rule' },
  { email: 'agenda@camara.leg.br', name: 'Câmara dos Deputados', domain: 'camara.leg.br', subject: 'Câmara dos Deputados: plenário virtual aberto', snippet: 'Vote até sexta-feira.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 500, attachmentNames: [], userLabels: [], expected: 'governo', lang: 'pt', tier: 'rule' },

  // ─── VIAGENS — TAP / Hilton / United / Hotels.com (rule: domínio) ─────
  { email: 'voos@flytap.com', name: 'TAP Air Portugal', domain: 'flytap.com', subject: 'TAP: check-in disponível para o voo TP89', snippet: 'Escolha o seu assento.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 4, bodyLength: 565, attachmentNames: [], userLabels: [], expected: 'viagens', lang: 'pt', tier: 'rule' },
  { email: 'reservas@hilton.com', name: 'Hilton', domain: 'hilton.com', subject: 'Hilton: sua reserva de hotel confirmada em NYC', snippet: 'Boa estadia em Nova York.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 4, bodyLength: 575, attachmentNames: [], userLabels: [], expected: 'viagens', lang: 'pt', tier: 'rule' },
  { email: 'travel@united.com', name: 'United Airlines', domain: 'united.com', subject: 'United: your flight UA330 is confirmed', snippet: 'See your itinerary.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 4, bodyLength: 570, attachmentNames: [], userLabels: [], expected: 'viagens', lang: 'en', tier: 'rule' },
  { email: 'stay@hotels.com', name: 'Hotels.com', domain: 'hotels.com', subject: 'Hotels.com: your hotel booking confirmation', snippet: 'Your stay is booked.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 4, bodyLength: 560, attachmentNames: [], userLabels: [], expected: 'viagens', lang: 'en', tier: 'rule' },
  // ─── VIAGENS — Iberia es (embedding, domínio fora do Config) ──────────
  { email: 'reservas@iberia.com', name: 'Iberia', domain: 'iberia.com', subject: 'Iberia: reserva de vuelo confirmada', snippet: 'Embarque en el aeropuerto.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 4, bodyLength: 555, attachmentNames: [], userLabels: [], expected: 'viagens', lang: 'es', tier: 'embedding' },

  // ─── SAUDE — Sírio-Libanês / Kaiser / NHS / Pague Menos (rule) ────────
  { email: 'portal@siriolibanes.org.br', name: 'Hospital Sírio-Libanês', domain: 'siriolibanes.org.br', subject: 'Hospital Sírio-Libanês: resultado de exames liberado', snippet: 'Acesse o portal do paciente.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 470, attachmentNames: [], userLabels: [], expected: 'saude', lang: 'pt', tier: 'rule' },
  { email: 'appointments@kp.org', name: 'Kaiser Permanente', domain: 'kp.org', subject: 'Kaiser Permanente: your appointment is confirmed', snippet: 'Arrive 15 minutes early.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 455, attachmentNames: [], userLabels: [], expected: 'saude', lang: 'en', tier: 'rule' },
  { email: 'reminders@nhs.uk', name: 'NHS', domain: 'nhs.uk', subject: 'NHS: your vaccination appointment is booked', snippet: 'Bring your NHS number.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 445, attachmentNames: [], userLabels: [], expected: 'saude', lang: 'en', tier: 'rule' },
  { email: 'receita@paguemenos.com.br', name: 'Pague Menos', domain: 'paguemenos.com.br', subject: 'Pague Menos: sua receita médica foi validada', snippet: 'Pronta para retirada na loja.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 450, attachmentNames: [], userLabels: [], expected: 'saude', lang: 'pt', tier: 'rule' },
  // ─── SAUDE — Rede D'Or (embedding, domínio fora do Config) ────────────
  { email: 'agenda@rededor.com.br', name: "Rede D'Or", domain: 'rededor.com.br', subject: "Rede D'Or: sua cirurgia foi agendada no hospital", snippet: 'Equipe médica pronta para receber.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 460, attachmentNames: [], userLabels: [], expected: 'saude', lang: 'pt', tier: 'embedding' },

  // ─── ADS — PlayStation Store cross (keyword 4 vence domínio servicos 5)
  { email: 'store@playstation.com', name: 'PlayStation Store', domain: 'playstation.com', subject: 'PlayStation Store: descontos de até 70% nos jogos', snippet: 'Promoção por tempo limitado.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 5, bodyLength: 630, attachmentNames: [], userLabels: [], expected: 'ads', lang: 'pt', tier: 'rule' },

  // ─── FINANCE — Neon 🇧🇷 (rule: domínio + keyword Pix) ─────────────────
  { email: 'noreply@neon.com.br', name: 'Neon', domain: 'neon.com.br', subject: 'Neon: seu Pix chegou', snippet: 'Saldo disponível na conta.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 420, attachmentNames: [], userLabels: [], expected: 'finance', lang: 'pt', tier: 'rule' },

  // ─── JOB-SEARCH — LinkedIn recruiting messages (keywords vencem o domínio
  //     social 12): InMail, LinkedIn Jobs digest, recruiter message ───────
  { email: 'inmail-noreply@linkedin.com', name: 'LinkedIn', domain: 'linkedin.com', subject: 'InMail: Senior Backend Engineer opportunity', snippet: 'Um recrutador quer conversar com você.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 4, bodyLength: 540, attachmentNames: [], userLabels: [], expected: 'job-search', lang: 'pt', tier: 'rule' },
  { email: 'messages-noreply@linkedin.com', name: 'LinkedIn', domain: 'linkedin.com', subject: 'New message from a recruiter — Growth Marketing role', snippet: 'Vi seu perfil e tenho uma vaga.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 4, bodyLength: 530, attachmentNames: [], userLabels: [], expected: 'job-search', lang: 'en', tier: 'rule' },
  { email: 'jobalerts-noreply@linkedin.com', name: 'LinkedIn Jobs', domain: 'linkedin.com', subject: 'Jobs you may be interested in', snippet: 'Recomendações da semana.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 4, bodyLength: 520, attachmentNames: [], userLabels: [], expected: 'job-search', lang: 'en', tier: 'rule' },

  // ─── SOCIAL — Vimeo (rule: domínio) ───────────────────────────────────
  { email: 'updates@vimeo.com', name: 'Vimeo', domain: 'vimeo.com', subject: 'Vimeo: novo vídeo de quem você segue', snippet: 'Assista agora.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 4, bodyLength: 460, attachmentNames: [], userLabels: [], expected: 'social', lang: 'pt', tier: 'rule' },
];

if (typeof module !== 'undefined') module.exports = { MOCK_EMAILS_22 };
