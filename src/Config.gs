/**
 * Config.gs — categories, rules and tunables.
 *
 * The pattern docs in categories/<id>.md are the source of truth; keep this file
 * in sync with them. Categories are evaluated in array order (priority):
 * spam-trash → shopping → news → ads → servicos → newsletters → finance →
 * governo → viagens → saude → job-search → social → work.
 */
const CONFIG = {
  labelPrefix: 'GMO',
  processedLabel: 'GMO/Processed',
  needsReviewLabel: 'GMO/needs-review',
  searchHorizonDays: 3,          // max lookback per run (safety net)
  batchSize: 25,                 // threads fetched per GmailApp.search call
  maxRuntimeMs: 4.5 * 60 * 1000, // self-limit under the 6-min execution cap
  maxBatchesPerRun: 40,          // hard ceiling per invocation (40 × batchSize threads)
  pacing: {
    fetchDebounceMs: 300,        // cooldown after each search+extract burst (read phase)
    classifyDebounceMs: 200,     // cooldown after classify, before mutating Gmail labels
    labelChunkSize: 10,          // threads per label chunk (3 addLabel calls per thread)
    labelChunkDebounceMs: 400,   // cooldown between label chunks (write phase)
  },
  triggerMinutes: 60,            // trigger cadence; 60 → hourly (Apps Script allows 1,5,10,15,30,60)
  decisionTree: {
    minConfidence: 0.85,         // below this → defer downstream
    modelSource: 'TreeModel.gs', // or 'drive:tree-model-trained.json'
    bodyScanLen: 3000,           // chars kept for tree features (beyond snippet)
  },
  language: {
    minMatches: 3,               // stopword hits needed for a confident call
    minMargin: 0.6,              // winner share among all language hits
  },
  trainer: {
    maxPerClass: 60,             // labeled threads sampled per category
    maxDepth: 6,                 // ID3 depth cap
    minSamplesNode: 6,           // don't split below this sample count
    minSamplesTotal: 30,         // refuse to train below this total
  },
  embedding: {
    model: 'gemini-embedding-001', // text-embedding-004 was retired by Google (404 NOT_FOUND)
    outputDimensionality: 768,     // MRL truncation of the 3072-d default — compact, same API
    minSimilarity: 0.25,         // gate for an embedding-only verdict (grid-tuned: best of 144 combos on 785 mocks — tests/tune-gates.js)
    minMargin: 0.03,             // best vs runner-up similarity gap
    confirmMargin: 0.02,         // similarity veto margin for tree verdicts
    maxRetries: 2,
    backoffBaseMs: 1000,
    requestPacingMs: 200,        // min gap between embed requests (free-tier RPM)
    batchPacingMs: 16000,        // pause between prototype chunks — free tier counts every embedded text (~100/min); 25 texts/16s ≈ 94 RPM
    rateWindowWaitMs: 45000,     // em 429: espera a janela de RPM resetar antes de tentar o mesmo chunk de novo
    queue429MaxWaits: 6,         // modo fila: esperas de janela por request antes de declarar a cota esgotada
    postBuildCooldownMs: 45000,  // after the one-time prototype burst, wait out the RPM window
    snippetLen: 300,             // chars of plain body kept as snippet
  },
  // Needs-review flagging (precision metric): verdicts that cleared the
  // acceptance gates but sit in a low-confidence band get GMO/needs-review,
  // so the tag doubles as an ongoing measure of imprecision.
  // Grid-tuned via tests/tune-gates.js sobre 785 mocks (144 combos de gates +
  // 150 de bandas): accuracy 100% mantida, flags 176 → ~130 (-26% ruído).
  needsReview: {
    treeConfidence: 0.90,      // tree verdicts below this confidence → flag
                               // (política intencional: TODO tree "frágil" é
                               // flagado — fixture grassroots 0.88 do sandbox;
                               // o grid puro sugeriria 0.85-0.87 = menos ruído,
                               // mas perde a proteção da banda 0.87-0.90 real)
    embeddingSimilarity: 0.40, // embedding verdicts below this similarity → flag
                               // (grid: era 0.45 — 0.40 corta ruído sem perder
                               // cobertura; embedding ≥ 0.40 é sólido)
    embeddingMargin: 0.10,     // embedding verdicts with margin below this → flag
                               // (grid: era 0.15)
    reprocessBatch: 20,        // needs-review threads re-triaged per run/invocação
  },
  senderCacheMaxBytes: 8000,     // prune SENDER_CACHE near the 9KB property limit
};

const CATEGORIES = [
  // 1 — junk/blocklist; rules start EMPTY, promote from categories/spam-trash.md
  { id: 'spam-trash',
    rules: { domains: [],
             keywords: [] } },
  // 2 — e-commerce: order/shipping mail + marketplace promos. Kept ABOVE news/
  //     ads/newsletters so marketplace domains beat generic "unsubscribe" and
  //     promo keywords (cupom, % off…).
  { id: 'shopping',
    rules: { domains: ['shopee.com.br', 'shopee.com', 'shein.com',
                       'mercadolivre.com.br', 'mercadolivre.com',
                       'amazon.com.br', 'aliexpress.com',
                       'magazineluiza.com.br', 'americanas.com.br',
                       'lojasamericanas.com.br', 'casasbahia.com.br',
                       'netshoes.com.br', 'kabum.com.br', 'temu.com',
                       'ifood.com.br', 'carrefour.com.br',
                       'paodeacucar.com.br', 'rappi.com.br', 'rappi.com',
                       'renner.com.br', 'cec.com.br', 'dafiti.com.br',
                       'centauro.com.br', 'madeiramadeira.com.br',
                       'madeiramadeira.com', 'petz.com.br', 'cobasi.com.br',
                       'terabyteshop.com.br', 'pichau.com.br',
                       'leroymerlin.com.br', 'clubeextra.com.br',
                       'hirotafood.com.br',
                       'zara.com', 'nike.com', 'decathlon.com.br',
                       'natura.com.br', 'ebay.com'],
             keywords: ['seu pedido', 'pedido confirmado', 'pedido enviado',
                        'status do pedido', 'rastreio', 'saiu para entrega',
                        'compra realizada', 'your order',
                        'order shipped', 'order confirmed',
                        // Marcas BR comuns: lojas enviando de domínios de
                        // marketing não listados acima (nome/assunto/preview).
                        // Marketplaces: a promo da marca fica em shopping (2)
                        // em vez de ads (4) — comportamento documentado.
                        'mercado livre', 'mercadolivre', 'magalu',
                        'casas bahia', 'casasbahia', 'americanas',
                        'madeira madeira', 'madeiramadeira', 'riachuelo',
                        'amazon', 'shopee', 'shein', 'ifood',
                        'netshoes', 'kabum', 'centauro', 'dafiti',
                        'carrefour', 'pão de açúcar', 'paodeacucar',
                        'leroy merlin', 'leroymerlin', 'petz', 'cobasi',
                        'fast shop', 'polishop', 'casa e vídeo',
                        'loja do mecânico', 'havan', 'assai', 'assaí',
                        'submarino', 'clubeextra', 'clube extra',
                        'hirotafood', 'hirota food',
                        'encomenda', 'entregue'] } },
  // 3 — media outlets & breaking-news alerts. Above ads/newsletters so outlet
  //     domains and headline phrases win before bulk-mail keywords see the mail.
  { id: 'news',
    rules: { domains: ['nytimes.com', 'washingtonpost.com', 'cnn.com',
                       'bbc.com', 'theguardian.com', 'reuters.com',
                       'elpais.com', 'estadao.com.br', 'g1.globo.com',
                       'alphasignal.ai', 'mittechreview.com.br',
                       'fanmail.mlssoccer.com',
                       'folha.uol.com.br', 'cnnbrasil.com.br',
                       'espn.com.br', 'apnews.com'],
             keywords: ['breaking news', 'top headlines',
                        'últimas notícias', 'ultimas noticias',
                        'notícias de hoje', 'noticias de hoje',
                        'notícias de última hora', 'noticias de ultima hora',
                        'manchetes de hoje'] } },
  // 4 — commercial promotions from known brands (coupons, % off, seasonal
  //     sales). Above newsletters: promo preheaders usually carry "unsubscribe",
  //     and the more specific promo keywords must win first.
  { id: 'ads',
    rules: { domains: ['groupon.com', 'peixeurbano.com.br',
                       'zoom.com.br', 'smiles.com.br', 'idi.com.br',
                       'vivo.com.br', 'hostinger.com', 'meliuz.com.br',
                       'chicorei.com.br', 'mobly.com.br', 'drogasil.com.br',
                       'principiaskin.com', 'leetcode.com',
                       'cinemark.com.br', 'mcdonalds.com.br',
                       'bk.com.br'],
             keywords: ['% off', 'desconto', 'cupom', 'cupon',
                        'promoção', 'promocao', 'promoción', 'promocion',
                        'descuento', 'black friday',
                        'liquidação', 'liquidacao',
                        'coupon', 'promo code', 'flash sale', 'discount'] } },
  // 5 — contas digitais & SaaS: alertas de segurança, manutenção, avisos de
  //     conta/exclusão e atualizações de produtos que você USA. Acima de
  //     newsletters: alerta de conta ≠ marketing.
  { id: 'servicos',
    rules: { domains: ['stripo.email', 'notifications.stripo.email',
                       'duocards.com', 'accounts.google.com',
                       'whatsnew.sider.ai', 'doppler.com',
                       'lottiefiles.com', 'flutterflow.io', 'mermaid.ai',
                       'supabase.com', 'render.com', 'po.atlassian.net',
                       'account.live.com', 'id.apple.com', 'dropbox.com',
                       'canva.com', 'duolingo.com',
                       'adobe.com', 'playstation.com', 'epicgames.com',
                       'xbox.com'],
             keywords: ['account deletion', 'will be deleted',
                        'conta será deletada', 'conta será excluída',
                        'manutenção programada', 'scheduled maintenance',
                        'alerta de segurança', 'security alert',
                        'alerta de seguridad', 'new login to your account',
                        'product update', 'atualização de segurança'] } },
  // 6
  { id: 'newsletters',
    rules: { domains: ['substack.com', 'beehiiv.com', 'mailchimp.com',
                       'constantcontact.com', 'convertkit.com',
                       'rdstation.com.br', 'rdstation.com', 'e-goi.com',
                       'e-goi.net', 'allin.com.br', 'klicksend.com.br',
                       'virtualtarget.com.br',
                       'google.com', 'freecodecamp.org', 'posthog.com',
                       'cloudhq.net', 'rondouglas.com',
                       'medium.com', 'tldr.tech', 'producthunt.com'],
             keywords: ['newsletter', 'digest', 'webinar', 'unsubscribe',
                        'boletim'] } },
  // 7
  { id: 'finance',
    rules: { domains: ['nubank.com.br', 'paypal.com', 'stripe.com',
                       'itau.com.br', 'bradesco.com.br', 'santander.com.br',
                       'bb.com.br', 'mercadopago.com.br', 'picpay.com.br',
                       'pagseguro.com.br', 'bancointer.com.br', 'c6bank.com.br',
                       'xpi.com.br', 'serasa.com.br',
                       'serasaexperian.com.br', 'foregon.com', 'inter.co',
                       'contabilizei.com.br',
                       'caixa.gov.br', 'sicredi.com.br', 'wise.com',
                       'americanexpress.com', 'neon.com.br'],
             keywords: ['fatura', 'invoice', 'payment', 'statement',
                        'pix', 'boleto', 'extrato', 'billing'] } },
  // 8 — governo e serviços públicos BR: gov.br, Receita, prefeitura, MEI,
  //     INSS, Detran, IPTU, eleições.
  { id: 'governo',
    rules: { domains: ['meumeidigital.com.br',
                       'receita.fazenda.gov.br', 'detran.sp.gov.br',
                       'in.gov.br', 'senado.leg.br', 'irs.gov',
                       'planalto.gov.br', 'camara.leg.br'],
             keywords: ['gov.br', 'imposto de renda', 'irpf',
                        'perdão de dívidas', 'perdao de dividas',
                        'prefeitura', 'programa social',
                        'documento oficial', 'meu inss', 'inss',
                        'título de eleitor', 'iptu',
                        'seguridad social'] } },
  // 9 — viagens: reservas, check-in, voos, hospedagem e aluguel. OTA/aerolíneas
  //     famosas: Booking, Airbnb, LATAM, GOL, Azul, Decolar, Expedia, CVC,
  //     Emirates.
  { id: 'viagens',
    rules: { domains: ['booking.com', 'airbnb.com',
                       'latam.com', 'voegol.com.br', 'azul.com.br',
                       'decolar.com', 'expedia.com', 'cvc.com.br',
                       'emirates.com',
                       'marriott.com', 'ryanair.com', 'delta.com',
                       'maxmilhas.com.br',
                      'flytap.com', 'hilton.com', 'united.com',
                      'aa.com', 'hotels.com'],
             keywords: ['sua reserva', 'boarding pass',
                        'check-in online', 'seu voo', 'sua estadia',
                        'booking confirmation'] } },
  // 10 — saúde: consultas, exames, plano de saúde. Redes BR: Fleury, Einstein,
  //      Dr. Consulta, Unimed, SulAmérica — promova mais via
  //      analyzeUncategorized.
  { id: 'saude',
    rules: { domains: ['fleury.com.br', 'einstein.br', 'drconsulta.com',
                       'unimed.com.br', 'sulamerica.com.br',
                       'amil.com.br', 'dasa.com.br', 'sabin.com.br',
                       'hermespardini.com.br', 'walgreens.com',
                       'siriolibanes.org.br', 'kp.org', 'nhs.uk',
                       'paguemenos.com.br'],
             keywords: ['consulta marcada', 'resultado de exame',
                        'plano de saúde', 'vacinação', 'receita médica'] } },
  // 11
  { id: 'job-search',
    rules: { domains: ['indeed.com', 'glassdoor.com', 'gupy.io',
                       'remoterocketship.com', 'jobgether.com',
                       'alignerr.com', 'twinehq.com', 'ashbyhq.com',
                       'mercor.com', 'revelo.com',
                       'catho.com.br', 'vagas.com.br',
                       'workana.com', 'upwork.com'],
             keywords: ['job alert', 'new jobs', 'vaga', 'interview invitation',
                        'shared a job',
                        'inmail', 'linkedin jobs',
                        'jobs you may be interested', 'job recommendation',
                        'recruiter', 'recrutador',
                        'opportunity'] } },
  // 12
  { id: 'social',
    rules: { domains: ['linkedin.com', 'x.com', 'instagram.com', 'facebookmail.com',
                       'tiktok.com', 'pinterest.com', 'reddit.com', 'discord.com',
                       'bandmix.com.br',
                       'twitch.tv', 'threads.net', 'bsky.app', 'kwai.com',
                       'vimeo.com'],
             keywords: [] } },
  // 13 — evaluated last so precise categories win first
  { id: 'work',
    rules: { domains: ['slack.com', 'zoom.us', 'notion.so', 'atlassian.com',
                       'asana.com', 'trello.com', 'figma.com', 'github.com',
                       'gitlab.com', 'miro.com', 'linear.app', 'dropbox.com',
                       'vercel.com',
                       'totvs.com.br', 'salesforce.com', 'zendesk.com',
                       'jetbrains.com'],
             keywords: ['deadline', 'meeting', 'sprint', 'ticket',
                        'pull request', 'code review'] } },
];

const FALLBACK_CATEGORY = { id: 'uncategorized' };
