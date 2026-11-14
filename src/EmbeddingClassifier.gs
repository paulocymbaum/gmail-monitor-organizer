/**
 * EmbeddingClassifier.gs — FREE embedding-similarity tier
 * (replaces the former Gemini generation fallback; ARCHITECTURE.md §4.6).
 *
 * How it works:
 *  1. Prototype build (once): reference phrases per category (EN/PT/ES) are
 *     embedded with Google's FREE gemini-embedding-001 model (768-d via MRL
 *     outputDimensionality); per-category exemplar vectors are stored in Drive
 *     (embedding-prototypes.json, stamped with model+dim — rebuilt automatically
 *     if the model changes, since vector spaces are not interchangeable).
 *  2. classify path: embed subject + snippet → cosine similarity against every
 *     centroid → best category if it clears the similarity + margin gates.
 *  3. confirm(treeCategory, sims): token-similarity double-check of a
 *     decision-tree verdict — agreement confirms the tree's probability; a
 *     clear contradiction vetoes it in favor of the embedding verdict.
 *
 * No AI generation, no token costs: embeddings on this model are free, and the
 * per-sender cache means ~1 embed call per unknown sender, ever.
 */
const EmbeddingClassifier = (function () {
  // Two API versions tried in order — a 404 on one sticks to the other (the
  // choice persists for the whole execution via endpointIdx).
  const ENDPOINTS = [
    'https://generativelanguage.googleapis.com/v1beta/models/',
    'https://generativelanguage.googleapis.com/v1/models/',
  ];
  let endpointIdx = 0;
  let batchUnavailable = false; // batchEmbedContents rejected → per-text embeds
  let runDisabled = false;      // prototype build failed once → skip rebuild spam
  const PROTO_FILE = 'embedding-prototypes.json';
  let prototypesCache = null;

  // Modo fila (queue429/backfillFila): em 429, espera a janela de RPM e repete
  // o MESMO pedido sem consumir tentativas; se esgotar a paciência (maxWaits),
  // sinaliza rateExhausted para o pipeline pausar a fila SEM marcar as threads.
  let ratePatience = false;
  let waits429 = 0;
  let rateExhaustedFlag = false;
  function setRatePatience(v) {
    ratePatience = !!v;
    waits429 = 0;
    rateExhaustedFlag = false;
  }
  function rateExhausted() { return rateExhaustedFlag; }
  function rateStats() {
    return { patience: ratePatience, waits: waits429, exhausted: rateExhaustedFlag };
  }

  function embedUrl(suffix, key) {
    return ENDPOINTS[endpointIdx] + CONFIG.embedding.model + suffix +
           '?key=' + encodeURIComponent(key);
  }

  // Seed reference phrases per category (EN/PT/ES). Edit freely, then run
  // buildEmbeddingPrototypes() to rebuild the centroid vectors.
  const REFERENCES = {
    'spam-trash': [
      'you won a prize claim now',
      'urgent account verification required',
      'verify your account or suspended',
      'lottery winner notification cash prize',
      'claim your free reward before it expires',
      'reclama tu premio del sorteo ahora mismo',
      'verifica tu cuenta bancaria inmediato',
      'ganhou um premio resgate agora',
      'resgate seu brinde agora',
      'verificacao urgente conta bancaria',
      'reclama tu premio cuenta suspendida',
      'ganador de la loteria reclama tu premio',
      'conta suspensa clique para verificar',
      'phishing nao clique em links suspeitos',
      'prize winner cash reward today',
    ],
    'shopping': [
      'your order has shipped tracking number inside',
      'pedido confirmado codigo de rastreio acompanhamento',
      'seu pedido foi enviado acompanhe a entrega',
      'status do pedido chegando hoje marketplace',
      'your package was delivered rate your purchase',
      'paquete enviado sigue tu envio en camino',
      'envio gratuito receba seu pedido em casa',
      'estado de tu pedido numero de seguimiento',
      'frete gratis na entrega do seu pedido',
      'frete gratis em compras acima de um valor minimo',
      'acompanhe a entrega da sua compra com frete gratis',
      'seu pedido em rota de entrega',
      'compra realizada com sucesso na loja',
      'seu pedido na loja confirme a retirada',
    ],
    'news': [
      'morning headlines newsroom today',
      'breaking news alert latest developments',
      'headlines newsroom developing world events',
      'developing stories coverage updates reporters live',
      'daily edition newspaper front page',
      'journalists report special investigation published',
      'ultimas noticias manchetes hoje jornal',
      'reportagem especial ao vivo cobertura jornalistica',
      'jornal de hoje acontecimentos politica economia',
      'noticias ultima hora directo titulares',
      'periodico diario actualidad reporteros informacion',
    ],
    'ads': [
      'flash sale limited time offer shop now save big',
      'exclusive discount coupon code inside',
      'member savings event best deals season',
      'spring sale new arrivals markdown prices',
      'black friday ofertas imperdiveis desconto especial',
      'promocao exclusiva so hoje aproveite cupom',
      'promo imperdivel aproveite hoje',
      'liquidacao temporada precos baixos',
      'descuento exclusivo promocion tiempo limitado',
      'cupon ahorro gran venta temporada',
      'ofertas exclusivas para assinantes do clube',
    ],
    'servicos': [
      'your account security alert sign in',
      'scheduled maintenance notice system downtime',
      'account deletion warning in days',
      'service update changelog release notes',
      'two factor authentication enabled',
      'new login to your account detected',
      'alerta de segurança sua conta acessada',
      'manutenção programada aviso de serviço',
      'sua conta será deletada excluída',
      'atualização do produto changelog novidades',
      'novo login detectado verifique dispositivo',
      'novo dispositivo acessou sua conta',
      'seu codigo de verificacao expira em minutos',
      'autenticação em dois passos ativada',
      'alerta de seguridad su cuenta inició sesión',
      'mantenimiento programado aviso de servicio',
      'su cuenta será eliminada borrada',
      'actualización del producto novedades',
      'nuevo inicio de sesión verifique dispositivo',
      'verificación en dos pasos activada',
    ],
    'governo': [
      'governo federal cpf receita federal',
      'imposto de renda declaração anual irpf',
      'prefeitura aviso ao munícipe documento',
      'gov br cadastro atualize seus dados',
      'programa social benefício do cidadão',
      'notificação oficial multa prazo',
      'gobierno trámite documento oficial',
      'cita previa administración pública',
      'aviso oficial plazo vencimiento',
      'government official notice deadline',
      'tax office annual declaration',
      'public service renewal application',
    ],
    'viagens': [
      'sua reserva de hotel confirmada',
      'check-in online voo embarque',
      'passagem aérea boarding pass viagem',
      'aluguel de carro locação turística',
      'pacote de viagem roteiro passeios',
      'your trip booking confirmation',
      'check in open for your flight seat selection',
      'flight deal book now vacation package',
      'hotel reservation check-in airport',
      'su vuelo sale mañana revise su reserva',
      'su reserva de vuelo confirmada',
      'check-in online vuelo embarque',
      'vuelo barato paquete de vacaciones',
      'alquiler de coche viaje turismo',
    ],
    'saude': [
      'consulta marcada clínica médica',
      'cirurgia agendada hospital equipe médica',
      'exames laboratoriais resultados prontos',
      'resultado de exame laboratório',
      'plano de saúde reembolso',
      'vacinação campanha imunização',
      'receita médica farmácia medicamento',
      'your medical appointment confirmed',
      'lab test results ready',
      'health insurance coverage claim',
      'vaccination appointment clinic',
      'prescription refill pharmacy',
      'cita medica esta confirmada traiga su documento',
      'resultado de análisis laboratorio',
      'seguro médico reembolso',
      'vacunación campaña salud',
      'receta médica farmacia medicamento',
    ],
    'newsletters': [
      'weekly newsletter from our publication',
      'digest of top stories unsubscribe',
      'unsubscribe anytime mailing list',
      'boletim semanal novidades nao quer mais receber descadastre',
      'darse de baja boletin correo novedades',
      'webinar invitation newsletter blog',
      'resumo semanal das principais noticias',
      'las noticias mas importantes de la semana',
      'assine e receba novidades por e-mail',
      'selecao semanal dos nossos editores boa leitura',
      'seleccion semanal del editor recomendaciones',
      'nuestra seleccion semanal ya esta aqui',
      'lista de leitura com titulos selecionados',
      'assine e receba nossa curadoria toda semana',
      'novidades da nossa loja toda semana descadastre',
      'suscribete y recibe cada viernes tu seleccion',
      'suscribete al newsletter de la marca cada mes',
      'you are receiving this because you subscribed unsubscribe here anytime',
      'the latest issue unsubscribe below enjoy reading',
    ],
    'finance': [
      'credit card invoice ready to pay',
      'payment receipt for your purchase',
      'monthly bank statement',
      'boleto do mes vencimento pagamento',
      'recebemos seu pagamento comprovante',
      'su factura del mes disponible pago',
      'recibimos tu pago gracias confirmacion',
      'segunda via do boleto anexa',
      'extrato bancario disponivel',
      'estado de cuenta resumen mensual',
      'payment reminder due date',
      'debito automatico autorizado',
      'boleto vence amanha pague antes',
      'factura disponible consulta los detalles',
    ],
    'job-search': [
      'job alert matching your profile',
      'recruiter message about a role',
      'recrutador viu seu perfil oportunidade',
      'interview invitation for a position',
      'application received next steps',
      'application status moved forward',
      'hiring update role growth',
      'oportunidade de emprego analista dados',
      'vagas candidatura oportunidade de emprego',
      'convocatoria entrevista analista',
      'nueva vacante desarrollador madrid',
      'vagas abertas para desenvolvedor',
      'seleccion de personal buscamos candidato',
      'job opening software engineer apply',
      'candidatura confirmada desenvolvedor full stack',
      'candidatura enviada suporte tecnico',
      'entrevista tecnica con el equipo',
      'your interview is scheduled thursday',
      'emprego novo selecionado para proxima etapa suporte',
      'vacante de soporte tecnico remoto aplica',
      'entrevista marcada para desenvolvedor confirme sua presenca',
      'oportunidad oportunidade emprego suporte dados candidatura aberta candidate-se',
      'oportunidad de emprego para el equipo de datos',
    ],
    'social': [
      'someone liked your photo on the network',
      'you have a new follower today',
      'new comment on your post from a friend',
      'tagged you in a photo see the tags',
      'curtiram sua publicacao veja os comentarios',
      'novos comentarios na sua publicacao',
      'alguem seguiu voce hoje',
      'nuevos seguidores reaccionaron a tu foto',
      'te dejaron un comentario nuevo',
      'curtidas e comentarios no seu perfil',
      'vamos jogar futebol com os amigos',
      'almoço amanhã com a galera',
      'game night with friends tonight',
      'reacciones y comentarios en tu publicacion',
      'new likes and follows this week',
      'nuevo seguidor esta semana miralo aqui',
    ],
    'work': [
      'meeting agenda project deadline team',
      'please review sign attached contract',
      'support ticket assigned sprint',
      'project kickoff agenda monday',
      'agenda da reuniao projeto pauta',
      'contrato para assinatura revisao',
      'orden del dia reunion jueves',
      'ata da reuniao e pauta do projeto',
      'acta de la reunion y plan de trabajo',
      'team standup notes and action items',
      'reunion de equipo el lunes alinear',
    ],
    'uncategorized': [
      'hi how are you doing long time',
      'happy birthday have a great day',
      'your package was delivered today',
      'check-in open for your flight',
      'oi tudo bem quanto tempo',
      'feliz aniversario muitos anos',
      'vamos tomar um cafe',
      'foi um prazer ver voce no evento',
      'fue un placer verte en la fiesta',
      'photos from saturday enjoy',
      'reminder water bill due',
      'table reservation confirmed tonight',
      'confirme o check-in do seu voo',
      'calendario escolar publicado datas',
      'lembrete renovacao assinatura academia',
      'weekly meal plan ideas',
      'su reserva esta confirmada para esta noche le esperamos',
      'doacao para a campanha toda ajuda conta',
    ],
  };

  function embedOne(text, taskType) {
    const key = State.getApiKey();
    if (!key) return null;
    const dim = CONFIG.embedding.outputDimensionality;
    let lastErr = null;
    let nextWaitMs = null; // 429 → honor Retry-After / longer backoff
    for (let attempt = 0; attempt <= CONFIG.embedding.maxRetries; attempt++) {
      if (attempt > 0) {
        Utils.sleep(nextWaitMs != null ? nextWaitMs
                  : CONFIG.embedding.backoffBaseMs * Math.pow(2, attempt - 1));
        nextWaitMs = null;
      }
      try {
        const payload = {
          model: 'models/' + CONFIG.embedding.model,
          content: { parts: [{ text: text }] },
          taskType: taskType || 'CLASSIFICATION',
        };
        if (dim) payload.outputDimensionality = dim;
        const res = UrlFetchApp.fetch(
          embedUrl(':embedContent', key),
          {
            method: 'post',
            contentType: 'application/json',
            payload: JSON.stringify(payload),
            muteHttpExceptions: true,
          });
        const code = res.getResponseCode();
        if (code >= 200 && code < 300) {
          waits429 = 0;   // janela limpou — reinicia o contador de esperas
          return JSON.parse(res.getContentText()).embedding.values;
        }
        if (code === 404 && endpointIdx < ENDPOINTS.length - 1) {
          endpointIdx++; // API version rejected → stick to the other one
          Utils.log('Embedding endpoint 404 — switching to ' + ENDPOINTS[endpointIdx]);
          attempt--;    // don't burn a retry on the endpoint switch
          continue;
        }
        if (code === 429) {
          waits429++;
          const windowWait = retryAfterMs(res) ||
            (CONFIG.embedding.rateWindowWaitMs || 45000);
          if (ratePatience && waits429 <= (CONFIG.embedding.queue429MaxWaits || 6)) {
            attempt--;    // modo fila: paciência não consome as tentativas
            nextWaitMs = windowWait;
          } else {
            if (ratePatience) rateExhaustedFlag = true;
            nextWaitMs = windowWait;
          }
          lastErr = new Error('HTTP 429');
        } else if (code >= 500) lastErr = new Error('HTTP ' + code);
        else {
          Utils.log('Embedding HTTP ' + code + ' — giving up. ' +
                    ENDPOINTS[endpointIdx] + CONFIG.embedding.model + ' — ' + errSnippet(res));
          return null;
        }
      } catch (e) { lastErr = e; }
    }
    Utils.log('Embedding failed after retries: ' + lastErr);
    return null;
  }

  function embedBatch(texts) {
    const key = State.getApiKey();
    if (!key) return null;
    const dim = CONFIG.embedding.outputDimensionality;
    let lastErr = null;
    let nextWaitMs = null; // 429 → honor Retry-After / longer backoff
    for (let attempt = 0; attempt <= CONFIG.embedding.maxRetries; attempt++) {
      if (attempt > 0) {
        Utils.sleep(nextWaitMs != null ? nextWaitMs
                  : CONFIG.embedding.backoffBaseMs * Math.pow(2, attempt - 1));
        nextWaitMs = null;
      }
      try {
        const res = UrlFetchApp.fetch(
          embedUrl(':batchEmbedContents', key),
          {
            method: 'post',
            contentType: 'application/json',
            payload: JSON.stringify({
              requests: texts.map(function (t) {
                const req = {
                  model: 'models/' + CONFIG.embedding.model,
                  content: { parts: [{ text: t }] },
                  taskType: 'CLASSIFICATION',
                };
                if (dim) req.outputDimensionality = dim;
                return req;
              }),
            }),
            muteHttpExceptions: true,
          });
        const code = res.getResponseCode();
        if (code >= 200 && code < 300) {
          waits429 = 0;   // janela limpou — reinicia o contador de esperas
          return JSON.parse(res.getContentText()).embeddings.map(function (e) { return e.values; });
        }
        if (code === 404 && endpointIdx < ENDPOINTS.length - 1) {
          endpointIdx++; // API version rejected → stick to the other one
          Utils.log('Embedding endpoint 404 — switching to ' + ENDPOINTS[endpointIdx]);
          attempt--;    // don't burn a retry on the endpoint switch
          continue;
        }
        if (code === 429) {
          waits429++;
          const windowWait = retryAfterMs(res) ||
            (CONFIG.embedding.rateWindowWaitMs || 45000);
          if (ratePatience && waits429 <= (CONFIG.embedding.queue429MaxWaits || 6)) {
            attempt--;    // modo fila: paciência não consome as tentativas
            nextWaitMs = windowWait;
          } else {
            if (ratePatience) rateExhaustedFlag = true;
            nextWaitMs = windowWait;
          }
          lastErr = new Error('HTTP 429');
        } else if (code >= 500) lastErr = new Error('HTTP ' + code);
        else {
          if (code === 404) batchUnavailable = true; // buildPrototypes falls back to single embeds
          Utils.log('Embedding batch HTTP ' + code + ' — giving up. ' +
                    ENDPOINTS[endpointIdx] + CONFIG.embedding.model + ' — ' + errSnippet(res));
          return null;
        }
      } catch (e) { lastErr = e; }
    }
    Utils.log('Embedding batch failed after retries: ' + lastErr);
    return null;
  }

  /** First ~180 chars of an error response body — makes API changes diagnosable. */
  function errSnippet(res) {
    try { return String(res.getContentText() || '').slice(0, 180); }
    catch (e) { return ''; }
  }

  /**
   * 429 wait: Retry-After header (seconds) → ms; senão o corpo JSON estilo
   * Generative ("error.details[].retryDelay": "30s"); else null.
   */
  function retryAfterMs(res) {
    try {
      const h = res.getHeaders();
      const keys = Object.keys(h);
      for (let i = 0; i < keys.length; i++) {
        if (keys[i].toLowerCase() === 'retry-after') {
          const s = parseInt(h[keys[i]], 10);
          if (!isNaN(s)) return (s + 1) * 1000;
        }
      }
    } catch (e) { /* headers unavailable */ }
    try {
      const body = JSON.parse(res.getContentText() || '{}');
      const details = (body.error && body.error.details) || [];
      for (let i = 0; i < details.length; i++) {
        const m = details[i] && details[i].retryDelay &&
                  String(details[i].retryDelay).match(/^(\d+)s$/);
        if (m) return (parseInt(m[1], 10) + 1) * 1000;
      }
    } catch (e) { /* body unavailable */ }
    return null;
  }

  /**
   * refsFingerprint() — stable hash of the reference phrase set. Prototype
   * caches built from different phrases are not reusable (nearest-exemplar
   * would silently miss the newer wording), so any phrase edit forces a
   * one-time rebuild on the next run.
   */
  function refsFingerprint() {
    const parts = [];
    Object.keys(REFERENCES).sort().forEach(function (id) {
      parts.push(id + ':' + REFERENCES[id].join('~'));
    });
    let h = 5381;
    const s = parts.join('|');
    for (let i = 0; i < s.length; i++) {
      h = (((h << 5) + h) + s.charCodeAt(i)) >>> 0;
    }
    return 'refs-' + h.toString(36);
  }

  /**
   * protosStale(cached) — true when a Drive-cached prototype file cannot be
   * reused: legacy bare-map format, built with a different model/dimension
   * (vector spaces are NOT interchangeable across models), missing any
   * category that REFERENCES now defines (e.g. the news/ads/shopping phrases
   * added later), or built from a different reference-phrase set (fingerprint
   * mismatch) — the similarity tier can only output categories it holds, with
   * the current wording.
   */
  function protosStale(cached) {
    if (!cached || !cached.protos || !cached.model) return true;
    if (cached.model !== CONFIG.embedding.model ||
        cached.dim !== (CONFIG.embedding.outputDimensionality || 0)) return true;
    const have = Object.keys(cached.protos).sort().join(',');
    if (have !== Object.keys(REFERENCES).sort().join(',')) return true;
    return cached.refs !== refsFingerprint();
  }

  function normalize(v) {
    let sum = 0;
    for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
    const n = Math.sqrt(sum) || 1;
    return v.map(function (x) { return x / n; });
  }

  /** cosine(a, b) — dot product over defensively re-normalized vectors. */
  function cosine(a, b) {
    const na = normalize(a);
    const nb = normalize(b);
    let dot = 0;
    for (let i = 0; i < na.length; i++) dot += na[i] * nb[i];
    return dot;
  }

  function centroid(vecs) {
    const n = vecs.length;
    const acc = [];
    vecs.forEach(function (v) {
      normalize(v).forEach(function (x, i) { acc[i] = (acc[i] || 0) + x; });
    });
    return normalize(acc.map(function (x) { return x / n; }));
  }

  function buildPrototypes() {
    const texts = [];
    const spans = {};
    Object.keys(REFERENCES).forEach(function (id) {
      spans[id] = [texts.length, texts.length + REFERENCES[id].length];
      REFERENCES[id].forEach(function (t) { texts.push(id + ': ' + t); });
    });
    const vecs = [];
    for (let i = 0; i < texts.length; i += 25) {
      let chunk = null;
      if (!batchUnavailable) chunk = embedBatch(texts.slice(i, i + 25));
      if (!chunk) {
        // batchEmbedContents rejected (404/restricted) → per-text embedContent
        if (!batchUnavailable) {
          batchUnavailable = true;
          Utils.log('batchEmbedContents unavailable — falling back to single embedContent calls.');
        }
        chunk = [];
        const slice = texts.slice(i, i + 25);
        for (let j = 0; j < slice.length; j++) {
          const v = embedOne(slice[j], 'CLASSIFICATION');
          if (!v) return null;
          chunk.push(v);
          if (CONFIG.embedding.requestPacingMs > 0) Utils.sleep(CONFIG.embedding.requestPacingMs);
        }
      }
      vecs.push.apply(vecs, chunk);
      // Free-tier RPM counts every embedded text (~100/min): hold between
      // 25-text chunks long enough to stay under the window.
      const chunkPause = Math.max(CONFIG.embedding.requestPacingMs,
                                  CONFIG.embedding.batchPacingMs || 0);
      if (i + 25 < texts.length && chunkPause > 0) {
        Utils.sleep(chunkPause);
      }
    }
    // nearest-exemplar: keep every reference vector (blending them into a
    // centroid dilutes phrase-level semantics — worst across languages)
    const protos = {};
    Object.keys(spans).forEach(function (id) {
      protos[id] = vecs.slice(spans[id][0], spans[id][1]).map(function (v) {
        return normalize(v);
      });
    });
    return protos;
  }

  function ensurePrototypes() {
    if (prototypesCache) return prototypesCache;
    if (runDisabled) return null; // build already failed this run — no per-sender spam
    const cached = Utils.driveJsonGet('PROTO_FILE_ID', PROTO_FILE);
    if (cached && !protosStale(cached)) {        // same model + dimension → reuse
      prototypesCache = cached.protos;
      return prototypesCache;
    }
    if (cached) {
      Utils.log('Prototype cache built with a different model/dimension/category ' +
                'set — rebuilding.');
    }
    if (!State.getApiKey()) {
      if (!State.memo.apiKeyWarned) {
        Utils.log('GEMINI_API_KEY missing — embedding tier disabled; unknown senders fall back to "uncategorized".');
        State.memo.apiKeyWarned = true;
      }
      return null;
    }
    try {
      const protos = buildPrototypes();
      if (protos) {
        prototypesCache = protos;
        Utils.driveJsonPut('PROTO_FILE_ID', PROTO_FILE, {
          model: CONFIG.embedding.model,
          dim: CONFIG.embedding.outputDimensionality || 0,
          refs: refsFingerprint(),
          builtAt: new Date().toISOString(),
          protos: protos,
        });
        // The build burst consumed most of the per-minute request budget —
        // cool down so the first record embeds don't land in a closed window.
        // Happens ONCE (the cache persists in Drive from now on).
        const cooldown = CONFIG.embedding.postBuildCooldownMs || 0;
        if (cooldown > 0) {
          Utils.log('Prototype burst complete — cooling down ' + cooldown +
                    ' ms for the rate window (one-time).');
          Utils.sleep(cooldown);
        }
      } else {
        // one attempt per run — a failed build must not retry per unknown sender
        runDisabled = true;
        Utils.log('Embedding prototypes unavailable this run — unknown senders fall ' +
                  'back to "uncategorized". Run testEmbedding() for a raw diagnosis.');
      }
    } catch (e) {
      runDisabled = true;
      prototypesCache = null;
      Utils.log('Prototype build failed — embedding tier disabled this run. ' + e);
    }
    return prototypesCache;
  }

  /**
   * selfTest() — raw diagnosis: calls embedContent on every known endpoint and
   * reports status + response body (key never logged). Editor entry point:
   * testEmbedding().
   */
  function selfTest() {
    const key = State.getApiKey();
    if (!key) return { ok: false, error: 'GEMINI_API_KEY missing (Script Properties)' };
    const tried = [];
    for (let i = 0; i < ENDPOINTS.length; i++) {
      const res = UrlFetchApp.fetch(
        ENDPOINTS[i] + CONFIG.embedding.model + ':embedContent?key=' + encodeURIComponent(key),
        {
          method: 'post',
          contentType: 'application/json',
          muteHttpExceptions: true,
          payload: JSON.stringify({
            model: 'models/' + CONFIG.embedding.model,
            content: { parts: [{ text: 'connection test' }] },
            taskType: 'CLASSIFICATION',
            outputDimensionality: CONFIG.embedding.outputDimensionality || undefined,
          }),
        });
      const code = res.getResponseCode();
      tried.push({
        endpoint: ENDPOINTS[i],
        status: code,
        body: String(res.getContentText() || '').slice(0, 300),
      });
      if (code >= 200 && code < 300) {
        endpointIdx = i; // stick to the endpoint that works
        return { ok: true, vectorLen: JSON.parse(res.getContentText()).embedding.values.length, tried: tried };
      }
    }
    return { ok: false, tried: tried };
  }

  function buildText(msg) {
    // Same evidence the tree features scanned: subject + body scan (snippet fallback)
    return (msg.subject || '') + '. ' + String(msg.bodyScan || msg.snippet || '');
  }

  /** similarities(msg) → { categoryId: cosine } | null (tier unavailable). */
  function similarities(msg) {
    const protos = ensurePrototypes();
    if (!protos) return null;
    const v = embedOne(buildText(msg), 'CLASSIFICATION');
    if (!v) return null;
    const norm = normalize(v);
    const sims = {};
    Object.keys(protos).forEach(function (id) {
      let best = 0;
      protos[id].forEach(function (v) {
        const c = cosine(norm, v);
        if (c > best) best = c;
      });
      sims[id] = Math.round(10000 * best) / 10000;
    });
    return sims;
  }

  function sorted(sims) {
    return Object.keys(sims)
      .map(function (id) { return { id: id, sim: sims[id] }; })
      .sort(function (a, b) { return b.sim - a.sim; });
  }

  /**
   * decide(sims) → { category, similarity, margin } | null
   * Gates: best similarity ≥ minSimilarity AND best − runner-up ≥ minMargin.
   * margin (best − runner-up, 1 when there is no runner-up) feeds the
   * needs-review precision flag in Categorizer.
   */
  function decide(sims) {
    if (!sims) return null;
    const s = sorted(sims);
    if (!s.length) return null;
    if (s[0].sim < CONFIG.embedding.minSimilarity) return null;
    if (s.length > 1 && s[0].sim - s[1].sim < CONFIG.embedding.minMargin) return null;
    return { category: s[0].id, similarity: s[0].sim,
             margin: s.length > 1 ? Math.round(10000 * (s[0].sim - s[1].sim)) / 10000 : 1 };
  }

  /**
   * confirm(treeCategory, treeConfidence, sims) → { accepted, reason }
   * Token-similarity double-check of the tree's probability: agreement keeps
   * the tree verdict; a clear similarity contradiction vetoes it (and the
   * categorizer then uses the embedding verdict instead).
   */
  function confirm(treeCategory, treeConfidence, sims) {
    if (!sims) return { accepted: true, reason: 'embeddings-unavailable' };
    const s = sorted(sims);
    if (s[0].id === treeCategory) {
      return { accepted: true, reason: 'confirmed @ sim ' + s[0].sim };
    }
    const margin = s[0].sim - (s[1] ? s[1].sim : 0);
    if (s[0].sim >= CONFIG.embedding.minSimilarity &&
        margin >= CONFIG.embedding.confirmMargin) {
      return { accepted: false, reason: 'vetoed — similarity favors ' + s[0].id };
    }
    return { accepted: true, reason: 'similarity inconclusive' };
  }

  return {
    cosine: cosine,
    similarities: similarities,
    decide: decide,
    confirm: confirm,
    ensurePrototypes: ensurePrototypes,
    protosStale: protosStale,
    embedOne: embedOne,
    embedBatch: embedBatch,
    selfTest: selfTest,
    references: REFERENCES,
    refsFingerprint: refsFingerprint,
    setRatePatience: setRatePatience,
    rateExhausted: rateExhausted,
    rateStats: rateStats,
    buildText: buildText,
    rebuild: function () {
      prototypesCache = null;
      runDisabled = false;
      batchUnavailable = false;
      return ensurePrototypes();
    },
  };
})();

/** Editor entry point: rebuild the per-category prototype centroids. */
function buildEmbeddingPrototypes() { return EmbeddingClassifier.rebuild(); }

/** Editor entry point: raw diagnosis of the embedding API (status + body per endpoint). */
function testEmbedding() {
  const r = EmbeddingClassifier.selfTest();
  Utils.log('testEmbedding → ' + JSON.stringify(r));
  return r;
}

