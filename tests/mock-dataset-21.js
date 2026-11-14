/**
 * tests/mock-dataset-21.js — décimo-nono mock wave (+34 amostras, pt/en):
 * TERCEIRA rodada de MARCAS FAMOSAS — agora cobrindo as 8 categorias
 * originais com marcas BR/internacionais que ainda não tinham amostra:
 * shopping (Zara/Nike/Decathlon/Natura/eBay), news (Folha/CNN Brasil/ESPN/
 * AP), ads (Cinemark/McDonald's/Burger King/Uber/Uber Eats), newsletters
 * (Medium/TLDR/Product Hunt), finance (Caixa/Sicredi/Wise/Amex), job-search
 * (Catho/Vagas.com/Workana/Upwork), social (Twitch/Threads/Bluesky/Kwai) e
 * work (TOTVS/Salesforce/Zendesk/JetBrains) + Steam (servicos embedding).
 * Crosses documentados: Decathlon "% off" → shopping (2) vence ads (4);
 * Caixa (caixa.gov.br) → finance (7), sem trigger de governo (8);
 * Uber sem domínio → ads por keyword "desconto".
 */
const MOCK_EMAILS_21 = [
  // ─── SHOPPING — Zara / Nike / Decathlon / Natura / eBay (rule) ─────────
  { email: 'news@zara.com', name: 'Zara', domain: 'zara.com', subject: 'Zara: nova coleção disponível', snippet: 'Vista a nova temporada.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 5, bodyLength: 620, attachmentNames: [], userLabels: [], expected: 'shopping', lang: 'pt', tier: 'rule' },
  { email: 'noreply@nike.com', name: 'Nike', domain: 'nike.com', subject: 'Nike: novos arrivals de tênis', snippet: 'Corra para garantir.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 5, bodyLength: 610, attachmentNames: [], userLabels: [], expected: 'shopping', lang: 'pt', tier: 'rule' },
  { email: 'promocoes@decathlon.com.br', name: 'Decathlon', domain: 'decathlon.com.br', subject: 'Decathlon: equipamentos de corrida com 30% off', snippet: 'Prepare-se para a prova.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 5, bodyLength: 640, attachmentNames: [], userLabels: [], expected: 'shopping', lang: 'pt', tier: 'rule' },
  { email: 'clube@natura.com.br', name: 'Natura', domain: 'natura.com.br', subject: 'Natura: sua rotina de skincare completa', snippet: 'Monte seu kit.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 4, bodyLength: 600, attachmentNames: [], userLabels: [], expected: 'shopping', lang: 'pt', tier: 'rule' },
  { email: 'ship@ebay.com', name: 'eBay', domain: 'ebay.com', subject: 'eBay: your order has shipped', snippet: 'Track your package.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 4, bodyLength: 580, attachmentNames: [], userLabels: [], expected: 'shopping', lang: 'en', tier: 'rule' },

  // ─── NEWS — Folha / CNN Brasil / ESPN Brasil / AP (rule) ──────────────
  { email: 'noticias@folha.uol.com.br', name: 'Folha de S.Paulo', domain: 'folha.uol.com.br', subject: 'Folha: as notícias de hoje em seu e-mail', snippet: 'O resumo da manhã.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 6, bodyLength: 660, attachmentNames: [], userLabels: [], expected: 'news', lang: 'pt', tier: 'rule' },
  { email: 'alertas@cnnbrasil.com.br', name: 'CNN Brasil', domain: 'cnnbrasil.com.br', subject: 'CNN Brasil: últimas notícias agora', snippet: 'Cobertura ao vivo.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 6, bodyLength: 650, attachmentNames: [], userLabels: [], expected: 'news', lang: 'pt', tier: 'rule' },
  { email: 'jogos@espn.com.br', name: 'ESPN Brasil', domain: 'espn.com.br', subject: 'ESPN: os gols da rodada e destaques', snippet: 'Melhores momentos.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 6, bodyLength: 640, attachmentNames: [], userLabels: [], expected: 'news', lang: 'pt', tier: 'rule' },
  { email: 'briefing@apnews.com', name: 'AP News', domain: 'apnews.com', subject: 'AP News: top headlines for today', snippet: 'Your morning briefing.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 6, bodyLength: 655, attachmentNames: [], userLabels: [], expected: 'news', lang: 'en', tier: 'rule' },

  // ─── ADS — Cinemark / McDonald's / BK (rule: domínio+keyword) ─────────
  { email: 'promocoes@cinemark.com.br', name: 'Cinemark', domain: 'cinemark.com.br', subject: 'Cinemark: Pipcombo e ingressos com desconto', snippet: 'Aproveite a semana do cinema.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 5, bodyLength: 630, attachmentNames: [], userLabels: [], expected: 'ads', lang: 'pt', tier: 'rule' },
  { email: 'marketing@mcdonalds.com.br', name: "McDonald's Brasil", domain: 'mcdonalds.com.br', subject: "McDonald's Brasil: CashMéqui, acumule pontos", snippet: 'Resgate recompensas.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 5, bodyLength: 615, attachmentNames: [], userLabels: [], expected: 'ads', lang: 'pt', tier: 'rule' },
  { email: 'promocoes@bk.com.br', name: 'Burger King', domain: 'bk.com.br', subject: 'Burger King: Whopper com desconto só hoje', snippet: 'Peça pelo app.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 5, bodyLength: 620, attachmentNames: [], userLabels: [], expected: 'ads', lang: 'pt', tier: 'rule' },
  // ─── ADS — Uber (rule: keyword, SEM domínio no Config) ────────────────
  { email: 'noreply@uber.com', name: 'Uber', domain: 'uber.com', subject: 'Uber: corridas com desconto esta semana', snippet: 'Aproveite tarifas reduzidas.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 4, bodyLength: 590, attachmentNames: [], userLabels: [], expected: 'ads', lang: 'pt', tier: 'rule' },
  // ─── ADS — Uber Eats (embedding, SEM domínio no Config) ───────────────
  { email: 'eats@uber.com', name: 'Uber Eats', domain: 'uber.com', subject: 'Uber Eats: promo imperdível, só hoje no app', snippet: 'Restaurantes perto de você.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 5, bodyLength: 605, attachmentNames: [], userLabels: [], expected: 'ads', lang: 'pt', tier: 'embedding' },

  // ─── NEWSLETTERS — Medium / TLDR / Product Hunt (rule) ────────────────
  { email: 'digest@medium.com', name: 'Medium', domain: 'medium.com', subject: 'Medium Daily Digest: 5 artigos para você', snippet: 'Escolhidos a dedo.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 6, bodyLength: 640, attachmentNames: [], userLabels: [], expected: 'newsletters', lang: 'pt', tier: 'rule' },
  { email: 'daily@tldr.tech', name: 'TLDR', domain: 'tldr.tech', subject: 'TLDR: seu digest tech de hoje', snippet: 'Notícias de tech em 5 min.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 8, bodyLength: 700, attachmentNames: [], userLabels: [], expected: 'newsletters', lang: 'pt', tier: 'rule' },
  { email: 'daily@producthunt.com', name: 'Product Hunt', domain: 'producthunt.com', subject: 'Product Hunt: os 10 lançamentos da semana', snippet: 'Upvote seus favoritos.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 7, bodyLength: 660, attachmentNames: [], userLabels: [], expected: 'newsletters', lang: 'pt', tier: 'rule' },

  // ─── FINANCE — Caixa / Sicredi / Wise / Amex (rule) ───────────────────
  { email: 'noreply@caixa.gov.br', name: 'Caixa Econômica Federal', domain: 'caixa.gov.br', subject: 'Caixa: extrato da sua conta FGTS', snippet: 'Consulte o saldo.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 520, attachmentNames: [], userLabels: [], expected: 'finance', lang: 'pt', tier: 'rule' },
  { email: 'cobranca@sicredi.com.br', name: 'Sicredi', domain: 'sicredi.com.br', subject: 'Sicredi: fatura do cartão disponível', snippet: 'Vencimento em 10 dias.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 530, attachmentNames: [], userLabels: [], expected: 'finance', lang: 'pt', tier: 'rule' },
  { email: 'updates@wise.com', name: 'Wise', domain: 'wise.com', subject: 'Wise: your transfer has arrived', snippet: 'Money is in your account.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 510, attachmentNames: [], userLabels: [], expected: 'finance', lang: 'en', tier: 'rule' },
  { email: 'cards@americanexpress.com', name: 'American Express', domain: 'americanexpress.com', subject: 'American Express: seu cartão foi aprovado', snippet: 'Acompanhe o envio.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 525, attachmentNames: [], userLabels: [], expected: 'finance', lang: 'pt', tier: 'rule' },

  // ─── JOB-SEARCH — Catho / Vagas.com / Workana / Upwork (rule) ─────────
  { email: 'alertas@catho.com.br', name: 'Catho', domain: 'catho.com.br', subject: 'Catho: 12 vagas novas para seu perfil', snippet: 'Candidate-se hoje.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 5, bodyLength: 580, attachmentNames: [], userLabels: [], expected: 'job-search', lang: 'pt', tier: 'rule' },
  { email: 'oportunidades@vagas.com.br', name: 'Vagas.com', domain: 'vagas.com.br', subject: 'Vagas.com: oportunidades selecionadas para você', snippet: 'Compatíveis com seu currículo.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 5, bodyLength: 570, attachmentNames: [], userLabels: [], expected: 'job-search', lang: 'pt', tier: 'rule' },
  { email: 'projetos@workana.com', name: 'Workana', domain: 'workana.com', subject: 'Workana: projetos freelance combinam com você', snippet: 'Envie sua proposta.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 5, bodyLength: 560, attachmentNames: [], userLabels: [], expected: 'job-search', lang: 'pt', tier: 'rule' },
  { email: 'notifications@upwork.com', name: 'Upwork', domain: 'upwork.com', subject: 'Upwork: new job alerts for you', snippet: 'Matches with your skills.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 5, bodyLength: 575, attachmentNames: [], userLabels: [], expected: 'job-search', lang: 'en', tier: 'rule' },

  // ─── SOCIAL — Twitch / Threads / Bluesky / Kwai (rule: domínio) ───────
  { email: 'no-reply@twitch.tv', name: 'Twitch', domain: 'twitch.tv', subject: 'Twitch: canal que você segue está ao vivo', snippet: 'Entre na transmissão.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 4, bodyLength: 480, attachmentNames: [], userLabels: [], expected: 'social', lang: 'pt', tier: 'rule' },
  { email: 'noreply@threads.net', name: 'Threads', domain: 'threads.net', subject: 'Threads: novo seguidor para você', snippet: 'Veja o perfil.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 450, attachmentNames: [], userLabels: [], expected: 'social', lang: 'pt', tier: 'rule' },
  { email: 'hello@bsky.app', name: 'Bluesky', domain: 'bsky.app', subject: 'Bluesky: bem-vindo ao seu novo feed', snippet: 'Siga mais pessoas.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 445, attachmentNames: [], userLabels: [], expected: 'social', lang: 'pt', tier: 'rule' },
  { email: 'updates@kwai.com', name: 'Kwai', domain: 'kwai.com', subject: 'Kwai: vídeos novos de quem você segue', snippet: 'Não perca as lives.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 4, bodyLength: 470, attachmentNames: [], userLabels: [], expected: 'social', lang: 'pt', tier: 'rule' },

  // ─── WORK — TOTVS / Salesforce / Zendesk / JetBrains (rule: domínio) ──
  { email: 'notificacoes@totvs.com.br', name: 'TOTVS', domain: 'totvs.com.br', subject: 'TOTVS: atualização do sistema ERP agendada', snippet: 'Janela de manutenção técnica.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 540, attachmentNames: [], userLabels: [], expected: 'work', lang: 'pt', tier: 'rule' },
  { email: 'reports@salesforce.com', name: 'Salesforce', domain: 'salesforce.com', subject: 'Salesforce: seu pipeline de vendas da semana', snippet: 'Resumo das oportunidades.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 4, bodyLength: 550, attachmentNames: [], userLabels: [], expected: 'work', lang: 'pt', tier: 'rule' },
  { email: 'support@zendesk.com', name: 'Zendesk', domain: 'zendesk.com', subject: 'Zendesk: novo ticket atribuído a você', snippet: 'Prazo de primeira resposta: 4h.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 530, attachmentNames: [], userLabels: [], expected: 'work', lang: 'pt', tier: 'rule' },
  { email: 'licensing@jetbrains.com', name: 'JetBrains', domain: 'jetbrains.com', subject: 'JetBrains: sua licença do PyCharm expira', snippet: 'Renove para continuar.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 520, attachmentNames: [], userLabels: [], expected: 'work', lang: 'pt', tier: 'rule' },

  // ─── SERVICOS — Steam (embedding, domínio fora do Config) ─────────────
  { email: 'noreply@steampowered.com', name: 'Steam', domain: 'steampowered.com', subject: 'Steam: um novo dispositivo se conectou à sua conta Steam', snippet: 'Confirme que foi você.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 430, attachmentNames: [], userLabels: [], expected: 'servicos', lang: 'pt', tier: 'embedding' },
];

if (typeof module !== 'undefined') module.exports = { MOCK_EMAILS_21 };
