/**
 * tests/mock-dataset-20.js — décimo-oitavo mock wave (+22 amostras, pt/en/es):
 * SEGUNDA rodada de MARCAS FAMOSAS nas 4 categorias novas, com foco em
 * precedência cruzada:
 *  - Zoom (zoom.us, domínio work 13) + "Security alert" → keyword servicos (5)
 *    vence ANTES do domínio work (convite de reunião Zoom continua em work —
 *    mock-dataset-14);
 *  - Booking (domínio viagens 9) + "promoção" → keyword ads (4) vence;
 *  - embedding-tier sem domínio no Config: Spotify, Tripadvisor, Zocdoc,
 *    Farmacia San Pablo.
 * Marcas novas em rule: Canva, Duolingo, Diário Oficial (in.gov.br), Senado,
 * IRS, Marriott, Ryanair, Delta, MaxMilhas, Amil, Dasa, Sabin, Hermes Pardini,
 * Walgreens.
 */
const MOCK_EMAILS_20 = [
  // ─── SERVICOS — Canva / Duolingo (rule: domínio) ──────────────────────
  { email: 'updates@canva.com', name: 'Canva', domain: 'canva.com', subject: 'Canva: login em novo dispositivo detectado', snippet: 'Não foi você? Proteja sua conta.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 430, attachmentNames: [], userLabels: [], expected: 'servicos', lang: 'pt', tier: 'rule' },
  { email: 'noreply@duolingo.com', name: 'Duolingo', domain: 'duolingo.com', subject: 'Duolingo: sua conta foi acessada em um novo dispositivo', snippet: 'Revise a atividade recente.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 420, attachmentNames: [], userLabels: [], expected: 'servicos', lang: 'pt', tier: 'rule' },
  // ─── SERVICOS — Zoom cross-precedência (keyword 5 vence domínio work 13)
  { email: 'no-reply@zoom.us', name: 'Zoom', domain: 'zoom.us', subject: 'Zoom: Security alert — new sign-in to your account', snippet: 'If this was you, no action needed.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 2, bodyLength: 400, attachmentNames: [], userLabels: [], expected: 'servicos', lang: 'en', tier: 'rule' },
  // ─── SERVICOS — Spotify (embedding, domínio fora do Config) ───────────
  { email: 'no-reply@spotify.com', name: 'Spotify', domain: 'spotify.com', subject: 'Spotify: new login detected on your account', snippet: 'Review your devices.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 410, attachmentNames: [], userLabels: [], expected: 'servicos', lang: 'en', tier: 'embedding' },

  // ─── GOVERNO — Diário Oficial / Senado (rule: domínio) ────────────────
  { email: 'noticias@in.gov.br', name: 'Diário Oficial da União', domain: 'in.gov.br', subject: 'Diário Oficial da União: edição extraordinária publicada', snippet: 'Confira as seções do dia.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 520, attachmentNames: [], userLabels: [], expected: 'governo', lang: 'pt', tier: 'rule' },
  { email: 'agencia@senado.leg.br', name: 'Senado Federal', domain: 'senado.leg.br', subject: 'Senado Notícias: pauta de votações da semana', snippet: 'Acompanhe as sessões.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 500, attachmentNames: [], userLabels: [], expected: 'governo', lang: 'pt', tier: 'rule' },
  // ─── GOVERNO — Receita CNPJ (rule: domínio) + IRS (rule: domínio) ─────
  { email: 'cnpj@receita.fazenda.gov.br', name: 'Receita Federal', domain: 'receita.fazenda.gov.br', subject: 'Cartão CNPJ: comprovante de inscrição disponível', snippet: 'Emita pela internet.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 510, attachmentNames: [], userLabels: [], expected: 'governo', lang: 'pt', tier: 'rule' },
  { email: 'updates@irs.gov', name: 'IRS', domain: 'irs.gov', subject: 'IRS: notice about your 2025 tax return', snippet: 'Action may be required.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 500, attachmentNames: [], userLabels: [], expected: 'governo', lang: 'en', tier: 'rule' },
  // ─── GOVERNO — DNI es (embedding) ─────────────────────────────────────
  { email: 'citas@gobierno.es', name: 'Gobierno de España', domain: 'gobierno.es', subject: 'Gobierno: cita previa para renovación del DNI', snippet: 'Solicite su turno.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 490, attachmentNames: [], userLabels: [], expected: 'governo', lang: 'es', tier: 'embedding' },

  // ─── VIAGENS — Marriott / Ryanair / Delta / MaxMilhas (rule: domínio) ──
  { email: 'reservations@marriott.com', name: 'Marriott', domain: 'marriott.com', subject: 'Marriott: your hotel reservation confirmation', snippet: 'We look forward to your stay.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 4, bodyLength: 580, attachmentNames: [], userLabels: [], expected: 'viagens', lang: 'en', tier: 'rule' },
  { email: 'voos@ryanair.com', name: 'Ryanair', domain: 'ryanair.com', subject: 'Ryanair: check-in online aberto — voo FR1234', snippet: 'Não perca o horário.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 4, bodyLength: 570, attachmentNames: [], userLabels: [], expected: 'viagens', lang: 'pt', tier: 'rule' },
  { email: 'fly@delta.com', name: 'Delta Air Lines', domain: 'delta.com', subject: 'Delta: your flight DL450 boarding pass', snippet: 'Download your pass.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 4, bodyLength: 580, attachmentNames: [], userLabels: [], expected: 'viagens', lang: 'en', tier: 'rule' },
  { email: 'reservas@maxmilhas.com.br', name: 'MaxMilhas', domain: 'maxmilhas.com.br', subject: 'MaxMilhas: sua reserva de voo com milhas', snippet: 'Detalhes do embarque.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 4, bodyLength: 560, attachmentNames: [], userLabels: [], expected: 'viagens', lang: 'pt', tier: 'rule' },
  // ─── VIAGENS — Booking cross-precedência (keyword ads 4 vence domínio 9)
  { email: 'ofertas@booking.com', name: 'Booking.com', domain: 'booking.com', subject: 'Ofertas Booking: promoção de verão em pacotes', snippet: 'Reserve antes que acabe.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 5, bodyLength: 620, attachmentNames: [], userLabels: [], expected: 'ads', lang: 'pt', tier: 'rule' },
  // ─── VIAGENS — Tripadvisor (embedding, domínio fora do Config) ────────
  { email: 'news@tripadvisor.com', name: 'Tripadvisor', domain: 'tripadvisor.com', subject: 'Tripadvisor: reserve sua viagem e descubra passeios incríveis', snippet: 'Ideias para o próximo destino.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 5, bodyLength: 600, attachmentNames: [], userLabels: [], expected: 'viagens', lang: 'pt', tier: 'embedding' },

  // ─── SAUDE — Amil / Dasa / Sabin / Hermes Pardini / Walgreens (rule) ──
  { email: 'autorizacoes@amil.com.br', name: 'Amil', domain: 'amil.com.br', subject: 'Amil: autorização de exames aprovada', snippet: 'Apresente no local da coleta.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 460, attachmentNames: [], userLabels: [], expected: 'saude', lang: 'pt', tier: 'rule' },
  { email: 'resultados@dasa.com.br', name: 'Dasa', domain: 'dasa.com.br', subject: 'Dasa: seus exames laboratoriais estão prontos', snippet: 'Acesse pelo app.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 450, attachmentNames: [], userLabels: [], expected: 'saude', lang: 'pt', tier: 'rule' },
  { email: 'portal@sabin.com.br', name: 'Sabin', domain: 'sabin.com.br', subject: 'Sabin: resultado de exame disponível', snippet: 'Consulte o portal do paciente.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 440, attachmentNames: [], userLabels: [], expected: 'saude', lang: 'pt', tier: 'rule' },
  { email: 'agenda@hermespardini.com.br', name: 'Hermes Pardini', domain: 'hermespardini.com.br', subject: 'Hermes Pardini: sua consulta foi agendada', snippet: 'Chegue com antecedência.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 445, attachmentNames: [], userLabels: [], expected: 'saude', lang: 'pt', tier: 'rule' },
  { email: 'pharmacy@walgreens.com', name: 'Walgreens', domain: 'walgreens.com', subject: 'Walgreens: your prescription refill is ready', snippet: 'Pick up at your store.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 430, attachmentNames: [], userLabels: [], expected: 'saude', lang: 'en', tier: 'rule' },
  // ─── SAUDE — Zocdoc en / Farmacia es (embedding) ──────────────────────
  { email: 'confirm@zocdoc.com', name: 'Zocdoc', domain: 'zocdoc.com', subject: 'Zocdoc: your medical appointment is confirmed', snippet: 'See you soon.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 425, attachmentNames: [], userLabels: [], expected: 'saude', lang: 'en', tier: 'embedding' },
  { email: 'recetas@farmaciasanpablo.es', name: 'Farmacia San Pablo', domain: 'farmaciasanpablo.es', subject: 'Farmacia San Pablo: su receta médica está lista', snippet: 'Pase a recogerla.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 420, attachmentNames: [], userLabels: [], expected: 'saude', lang: 'es', tier: 'embedding' },
];

if (typeof module !== 'undefined') module.exports = { MOCK_EMAILS_20 };
