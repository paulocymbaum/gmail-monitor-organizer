/**
 * tests/mock-dataset-10.js — eighth mock wave (+11 samples, EN/PT/ES) validating
 * the NEW `news` and `ads` categories: rule-tier domain/keyword hits, the
 * hand-crafted tree's `ads_signal` leaf (v2.1), and the embedding prototypes
 * for news/ads — plus the shopping prototypes the reference map was missing.
 * Rich fields, mock-dataset-9 style.
 */
const MOCK_EMAILS_10 = [
  // ─── RULE TIER — news ──────────────────────────────────────────
  { email: 'alerts@nytimes.com', name: 'The New York Times', domain: 'nytimes.com', subject: 'Breaking News: Senate passes landmark bill', snippet: 'Read the full report.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 3, bodyLength: 900, attachmentNames: [], userLabels: [], expected: 'news', lang: 'en', tier: 'rule' },
  { email: 'g1@g1.globo.com', name: 'g1', domain: 'g1.globo.com', subject: 'Últimas notícias: confira as manchetes de hoje', snippet: 'Acompanhe ao vivo.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 4, bodyLength: 800, attachmentNames: [], userLabels: [], expected: 'news', lang: 'pt', tier: 'rule' },
  { email: 'alertas@elpais.com', name: 'El País', domain: 'elpais.com', subject: 'Noticias de última hora: los mercados reaccionan', snippet: 'Toda la actualidad.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 4, bodyLength: 750, attachmentNames: [], userLabels: [], expected: 'news', lang: 'es', tier: 'rule' },
  { email: 'news@unknown-press.co', name: 'The Ledger', domain: 'unknown-press.co', subject: 'Top headlines for your morning commute', snippet: 'Five stories to start the day.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 5, bodyLength: 650, attachmentNames: [], userLabels: [], expected: 'news', lang: 'en', tier: 'rule' },
  // ─── RULE TIER — ads ───────────────────────────────────────────
  { email: 'promo@lojadobem.com.br', name: 'Loja do Bem', domain: 'lojadobem.com.br', subject: 'Promoção especial: desconto de 40% em tudo', snippet: 'Cupom BEM40 — só esta semana.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 12, bodyLength: 1600, attachmentNames: [], userLabels: [], expected: 'ads', lang: 'pt', tier: 'rule' },
  { email: 'deals@groupon.com', name: 'Groupon', domain: 'groupon.com', subject: 'Deals of the week: save big near you', snippet: 'Limited time offers.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 10, bodyLength: 1300, attachmentNames: [], userLabels: [], expected: 'ads', lang: 'en', tier: 'rule' },
  { email: 'rebajas@tienda-es.com', name: 'Tienda ES', domain: 'tienda-es.com', subject: 'Descuento exclusivo: promoción por tiempo limitado', snippet: 'Cupón AHORRA20.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 9, bodyLength: 1200, attachmentNames: [], userLabels: [], expected: 'ads', lang: 'es', tier: 'rule' },
  // ─── TREE TIER — ads leaf (promo markers live in the body scan) ─
  { email: 'club@stylecrate.com', name: 'StyleCrate', domain: 'stylecrate.com', subject: 'Member savings inside', snippet: 'Open to view your picks.', bodyScan: 'flash sale — limited time offer, shop now and save big on everything', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 9, bodyLength: 1800, attachmentNames: [], userLabels: [], expected: 'ads', lang: 'en', tier: 'tree' },
  // ─── EMBEDDING TIER — news / ads / shopping prototypes ─────────
  { email: 'bulletin@dailyledger.co', name: 'The Daily Ledger', domain: 'dailyledger.co', subject: 'Morning headlines: breaking developments from the newsroom', snippet: 'Top stories — follow live coverage.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 6, bodyLength: 850, attachmentNames: [], userLabels: [], expected: 'news', lang: 'en', tier: 'embedding' },
  { email: 'promo@brightdeals.net', name: 'Bright Deals', domain: 'brightdeals.net', subject: 'Member savings event — the season best deals', snippet: 'Shop new arrivals at markdown prices.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 11, bodyLength: 1400, attachmentNames: [], userLabels: [], expected: 'ads', lang: 'en', tier: 'embedding' },
  { email: 'marketing@lojinhaonline.com.br', name: 'Lojinha Online', domain: 'lojinhaonline.com.br', subject: 'Frete grátis em compras acima de R$ 99', snippet: 'Confira as ofertas da semana na loja.', bodyScan: '', toCount: 0, ccCount: 0, threadMsgCount: 1, linkCount: 5, bodyLength: 700, attachmentNames: [], userLabels: [], expected: 'shopping', lang: 'pt', tier: 'embedding' },
];

if (typeof module !== 'undefined') module.exports = { MOCK_EMAILS_10 };