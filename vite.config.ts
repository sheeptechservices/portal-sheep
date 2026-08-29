import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'http'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // `loadEnv` devolve um objeto, não popula `process.env` - e cada middleware
  // abaixo repassa `env` à mão para o que precisa. Só que `emailAdmin()`, em
  // `api/_papeis.ts`, lê `process.env.ADMIN_EMAIL` direto, sem receber nada:
  // sem esta linha ela cai no padrão embutido em dev e o dono do painel entra
  // como `membro`. Na Vercel o problema não existe, porque lá as variáveis já
  // nascem em `process.env`.
  if (env.ADMIN_EMAIL) process.env.ADMIN_EMAIL = env.ADMIN_EMAIL

  return {
    plugins: [
      react(),
      {
        name: 'local-api',
        configureServer(server) {
          // GET /api/submissions - needs to intercept before path-based mounts strip query params
          server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
            const url = new URL(req.url ?? '/', `http://localhost`)
            if (!url.pathname.startsWith('/api/submissions')) return next()

            if (req.method !== 'GET') {
              res.statusCode = 405
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Method not allowed' }))
              return
            }

            const sessionToken = String(req.headers['x-admin-session'] ?? '')
            const id = url.searchParams.get('id')

            ;(async () => {
              res.setHeader('Content-Type', 'application/json')
              const { createClient } = await import('@libsql/client')
              const db = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN })
              const { validateAdminSession } = await import('./api/_admin-handler')
              const valid = await validateAdminSession(db, sessionToken).catch(() => false)
              if (!valid) {
                res.statusCode = 401
                res.end(JSON.stringify({ error: 'Unauthorized' }))
                return
              }

              if (id) {
                const sub = await db.execute({ sql: 'SELECT * FROM solicitacoes WHERE id = ?', args: [id] })
                if (sub.rows.length === 0) {
                  res.statusCode = 404
                  res.end(JSON.stringify({ error: 'Not found' }))
                  return
                }
                const arqs = await db.execute({
                  sql: 'SELECT id, categoria, nome, tipo, tamanho, base64 FROM solicitacao_arquivos WHERE solicitacao_id = ?',
                  args: [id],
                })
                res.end(JSON.stringify({ submission: sub.rows[0], arquivos: arqs.rows }))
              } else {
                const result = await db.execute(`
                  SELECT s.*, COUNT(a.id) AS arquivo_count
                  FROM solicitacoes s
                  LEFT JOIN solicitacao_arquivos a ON a.solicitacao_id = s.id
                  GROUP BY s.id
                  ORDER BY s.created_at DESC
                `)
                res.end(JSON.stringify({ submissions: result.rows }))
              }
            })().catch(err => {
              console.error('[api/submissions]', err)
              res.statusCode = 500
              res.end(JSON.stringify({ error: 'Internal error' }))
            })
          })

          server.middlewares.use('/api/submit', (req: IncomingMessage, res: ServerResponse) => {
            if (req.method !== 'POST') {
              res.statusCode = 405
              res.end(JSON.stringify({ error: 'Method not allowed' }))
              return
            }

            let body = ''
            req.on('data', (chunk: Buffer) => { body += chunk.toString() })
            req.on('end', async () => {
              res.setHeader('Content-Type', 'application/json')
              try {
                const { id, createdAt, formData } = JSON.parse(body)

                if (!id || !createdAt || !formData) {
                  res.statusCode = 400
                  res.end(JSON.stringify({ error: 'Dados obrigatórios ausentes.' }))
                  return
                }

                const { createClient } = await import('@libsql/client')
                const db = createClient({
                  url: env.TURSO_DATABASE_URL,
                  authToken: env.TURSO_AUTH_TOKEN,
                })

                // Enforce cedente restriction + capture cedente_id
                const cnpjDigits = (formData.cnpjContratado ?? '').replace(/\D/g, '')
                let cedenteId: string | null = null
                if (cnpjDigits.length === 14) {
                  const cedente = await db.execute({ sql: 'SELECT id FROM cedentes WHERE cnpj_cpf = ? AND ativo = 1 LIMIT 1', args: [cnpjDigits] })
                  if (cedente.rows.length === 0) {
                    res.statusCode = 403
                    res.end(JSON.stringify({ error: 'CNPJ não está cadastrado como cedente.' }))
                    return
                  }
                  cedenteId = String(cedente.rows[0].id)
                }

                await db.execute(`
                  CREATE TABLE IF NOT EXISTS solicitacoes (
                    id                  TEXT PRIMARY KEY,
                    created_at          TEXT NOT NULL,
                    status              TEXT NOT NULL DEFAULT 'submitted',
                    cnpj_contratado     TEXT,
                    nome_contratado     TEXT,
                    situacao_contratado TEXT,
                    cnpj_sacado         TEXT,
                    nome_sacado         TEXT,
                    situacao_sacado     TEXT,
                    valor               TEXT,
                    valor_numerico      REAL,
                    prazo_limite        TEXT,
                    decisions           TEXT,
                    fim_type            INTEGER
                  )
                `)
                try { await db.execute(`ALTER TABLE solicitacoes ADD COLUMN parcelas TEXT`) } catch {}
                try { await db.execute(`ALTER TABLE solicitacoes ADD COLUMN previsao_execucao TEXT`) } catch {}
                try { await db.execute(`ALTER TABLE solicitacoes ADD COLUMN data_execucao TEXT`) } catch {}

                await db.execute(`
                  CREATE TABLE IF NOT EXISTS solicitacao_arquivos (
                    id             INTEGER PRIMARY KEY AUTOINCREMENT,
                    solicitacao_id TEXT NOT NULL,
                    categoria      TEXT NOT NULL,
                    nome           TEXT NOT NULL,
                    tipo           TEXT NOT NULL,
                    tamanho        INTEGER NOT NULL,
                    base64         TEXT NOT NULL
                  )
                `)

                // Auto-register sacado if not yet in DB
                const cnpjSacadoDigits = (formData.cnpjSacado ?? '').replace(/\D/g, '')
                let sacadoId: string | null = null
                if (cnpjSacadoDigits.length >= 11) {
                  const existing = await db.execute({ sql: 'SELECT id FROM sacados WHERE cnpj_cpf = ? LIMIT 1', args: [cnpjSacadoDigits] })
                  if (existing.rows.length > 0) {
                    sacadoId = String(existing.rows[0].id)
                  } else {
                    const { randomUUID } = await import('crypto')
                    const newSacadoId = randomUUID()
                    await db.execute({ sql: 'INSERT INTO sacados (id, cnpj_cpf, razao_social, criado_em) VALUES (?, ?, ?, ?)', args: [newSacadoId, cnpjSacadoDigits, formData.nomeSacado ?? null, createdAt] })
                    sacadoId = newSacadoId
                  }
                }

                await db.execute({
                  sql: `INSERT INTO solicitacoes (
                          id, created_at,
                          cnpj_contratado, nome_contratado, situacao_contratado,
                          cnpj_sacado, nome_sacado, situacao_sacado,
                          valor, valor_numerico, prazo_limite,
                          decisions, fim_type, cedente_id, sacado_id, parcelas
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                  args: [
                    id, createdAt,
                    cnpjDigits || null,
                    formData.nomeContratado ?? null,
                    formData.situacaoContratado ?? null,
                    cnpjSacadoDigits || null,
                    formData.nomeSacado ?? null,
                    formData.situacaoSacado ?? null,
                    formData.valor ?? null,
                    formData.valorNumerico ?? null,
                    formData.prazoLimite ?? null,
                    formData.decisions ? JSON.stringify(formData.decisions) : null,
                    formData.fimType ?? null,
                    cedenteId,
                    sacadoId,
                    formData.parcelas ? JSON.stringify(formData.parcelas) : null,
                  ],
                })

                // Auto-assign first kanban status
                try {
                  const { ensureAdminSchema } = await import('./api/_admin-handler')
                  await ensureAdminSchema(db)
                  const firstStatus = await db.execute(
                    `SELECT id FROM status_configs WHERE ativo = 1 ORDER BY ordem ASC LIMIT 1`
                  )
                  if (firstStatus.rows.length > 0) {
                    await db.execute({
                      sql: `INSERT INTO solicitacao_eventos (solicitacao_id, tipo, status_id, descricao, criado_em)
                            VALUES (?, 'status_change', ?, 'Solicitação recebida', ?)`,
                      args: [id, firstStatus.rows[0].id, createdAt],
                    })
                  }
                } catch (e) {
                  console.warn('[submit] auto-assign status failed:', e)
                }

                res.end(JSON.stringify({ ok: true, id }))
              } catch (err) {
                console.error('[api/submit]', err)
                res.statusCode = 500
                res.end(JSON.stringify({ error: 'Erro ao salvar solicitação. Tente novamente.' }))
              }
            })
          })

          server.middlewares.use('/api/submit-file', (req: IncomingMessage, res: ServerResponse) => {
            if (req.method !== 'POST') {
              res.statusCode = 405
              res.end(JSON.stringify({ error: 'Method not allowed' }))
              return
            }

            let body = ''
            req.on('data', (chunk: Buffer) => { body += chunk.toString() })
            req.on('end', async () => {
              res.setHeader('Content-Type', 'application/json')
              try {
                const { solicitacaoId, arquivo } = JSON.parse(body)
                if (!solicitacaoId || !arquivo?.base64 || !arquivo.nome) {
                  res.statusCode = 400
                  res.end(JSON.stringify({ error: 'Dados ausentes.' }))
                  return
                }

                const { createClient } = await import('@libsql/client')
                const db = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN })

                const row = await db.execute({ sql: 'SELECT id FROM solicitacoes WHERE id = ? LIMIT 1', args: [solicitacaoId] })
                if (row.rows.length === 0) {
                  res.statusCode = 404
                  res.end(JSON.stringify({ error: 'Solicitação não encontrada.' }))
                  return
                }

                await db.execute({
                  sql: `INSERT INTO solicitacao_arquivos (solicitacao_id, categoria, nome, tipo, tamanho, base64)
                        VALUES (?, ?, ?, ?, ?, ?)`,
                  args: [solicitacaoId, arquivo.categoria ?? '', arquivo.nome, arquivo.tipo ?? '', arquivo.tamanho ?? 0, arquivo.base64],
                })

                res.end(JSON.stringify({ ok: true }))
              } catch (err) {
                console.error('[api/submit-file]', err)
                res.statusCode = 500
                res.end(JSON.stringify({ error: 'Erro ao salvar arquivo.' }))
              }
            })
          })

          // /api/cnpj-lookup - proxy to external CNPJ APIs (avoids browser CORS)
          server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
            const url = new URL(req.url ?? '/', `http://localhost`)
            if (!url.pathname.startsWith('/api/cnpj-lookup')) return next()
            if (req.method !== 'GET') { res.statusCode = 405; res.end(); return }
            const digits = (url.searchParams.get('cnpj') ?? '').replace(/\D/g, '')
            if (digits.length !== 14) { res.statusCode = 400; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: 'CNPJ inválido' })); return }
            ;(async () => {
              res.setHeader('Content-Type', 'application/json')
              const numBR = (v: any): number | null => { if (v == null) return null; if (typeof v === 'number') return Number.isFinite(v) ? v : null; let s = String(v).trim().replace(/R\$\s*/g, ''); if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); const n = parseFloat(s); return Number.isFinite(n) ? n : null }
              const providers = [
                async () => { const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`, { signal: AbortSignal.timeout(6000) }); if (!r.ok) return null; const d = await r.json(); return { razao_social: d.razao_social ?? '', nome_fantasia: d.nome_fantasia ?? '', descricao_situacao_cadastral: d.descricao_situacao_cadastral ?? '', data_inicio_atividade: d.data_inicio_atividade ?? '', cnae: [d.cnae_fiscal, d.cnae_fiscal_descricao].filter(Boolean).join(' - '), capital_social: numBR(d.capital_social), porte: d.porte ?? '', socios: Array.isArray(d.qsa) ? d.qsa.map((s: any) => s.nome_socio).filter(Boolean) : [], logradouro: [d.logradouro, d.numero].filter(Boolean).join(', '), complemento: d.complemento ?? '', bairro: d.bairro ?? '', municipio: d.municipio ?? '', uf: d.uf ?? '', cep: (d.cep ?? '').replace(/\D/g, ''), natureza_juridica: d.natureza_juridica ?? '' } },
                async () => { const r = await fetch(`https://receitaws.com.br/v1/cnpj/${digits}`, { signal: AbortSignal.timeout(6000) }); if (!r.ok) return null; const d = await r.json(); if (d.status === 'ERROR') return null; const ap = Array.isArray(d.atividade_principal) ? d.atividade_principal[0] : null; return { razao_social: d.nome ?? '', nome_fantasia: d.fantasia ?? '', descricao_situacao_cadastral: d.situacao ?? '', data_inicio_atividade: d.abertura ?? '', cnae: ap ? [ap.code, ap.text].filter(Boolean).join(' - ') : '', capital_social: numBR(d.capital_social), porte: d.porte ?? '', socios: Array.isArray(d.qsa) ? d.qsa.map((s: any) => s.nome).filter(Boolean) : [], logradouro: [d.logradouro, d.numero].filter(Boolean).join(', '), complemento: d.complemento ?? '', bairro: d.bairro ?? '', municipio: d.municipio ?? '', uf: d.uf ?? '', cep: (d.cep ?? '').replace(/\D/g, ''), natureza_juridica: d.natureza_juridica ?? '' } },
                async () => { const r = await fetch(`https://publica.cnpj.ws/cnpj/${digits}`, { signal: AbortSignal.timeout(6000) }); if (!r.ok) return null; const d = await r.json(); const est = d.estabelecimento ?? {}; const nj = d.natureza_juridica; const natureza_juridica = nj?.id ?? nj?.descricao ?? ''; const ap = est.atividade_principal; return { razao_social: d.razao_social ?? '', nome_fantasia: est.nome_fantasia ?? '', descricao_situacao_cadastral: est.situacao_cadastral ?? '', data_inicio_atividade: est.data_inicio_atividade ?? '', cnae: ap ? [ap.subclasse ?? ap.id, ap.descricao].filter(Boolean).join(' - ') : '', capital_social: numBR(d.capital_social), porte: d.porte?.descricao ?? '', socios: Array.isArray(d.socios) ? d.socios.map((s: any) => s.nome).filter(Boolean) : [], logradouro: [est.logradouro, est.numero].filter(Boolean).join(', '), complemento: est.complemento ?? '', bairro: est.bairro ?? '', municipio: est.municipio ?? '', uf: est.estado?.sigla ?? '', cep: (est.cep ?? '').replace(/\D/g, ''), natureza_juridica } },
              ]
              for (const p of providers) {
                try { const result = await p(); if (result) { res.end(JSON.stringify(result)); return } } catch {}
              }
              res.statusCode = 404
              res.end(JSON.stringify({ error: 'CNPJ não encontrado' }))
            })().catch(err => {
              console.error('[api/cnpj-lookup]', err)
              res.statusCode = 500
              res.end(JSON.stringify({ error: 'Internal error' }))
            })
          })

          // /api/check-cedente - public cedente lookup by CNPJ
          server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
            const url = new URL(req.url ?? '/', `http://localhost`)
            if (!url.pathname.startsWith('/api/check-cedente')) return next()
            if (req.method !== 'GET') { res.statusCode = 405; res.end(); return }
            const cnpj = (url.searchParams.get('cnpj') ?? '').replace(/\D/g, '')
            if (cnpj.length !== 14) { res.statusCode = 400; res.end(JSON.stringify({ error: 'CNPJ inválido' })); return }
            ;(async () => {
              res.setHeader('Content-Type', 'application/json')
              const { createClient } = await import('@libsql/client')
              const db = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN })
              const r = await db.execute({ sql: 'SELECT id FROM cedentes WHERE cnpj_cpf = ? AND ativo = 1 LIMIT 1', args: [cnpj] })
              res.end(JSON.stringify({ found: r.rows.length > 0 }))
            })().catch(err => {
              console.error('[api/check-cedente]', err)
              res.statusCode = 500
              res.end(JSON.stringify({ error: 'Internal error' }))
            })
          })

          // /api/admin-data - all admin CRUD (uses shared _admin-handler)
          server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
            const url = new URL(req.url ?? '/', `http://localhost`)
            if (!url.pathname.startsWith('/api/admin-data')) return next()

            let body = ''
            req.on('data', (chunk: Buffer) => { body += chunk.toString() })
            req.on('end', async () => {
              res.setHeader('Content-Type', 'application/json')
              try {
                const { createClient } = await import('@libsql/client')
                const db = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN })
                const { handleAdminData, createAdminSession, getAdminSession, deleteAdminSession, checkLoginRateLimit, recordFailedLogin, clearLoginAttempts, upsertUsuarioGoogle, registrarAuditoria } = await import('./api/_admin-handler')
                const qs = new URLSearchParams(url.search)
                const parsed = body ? JSON.parse(body) : {}
                const bodyAction = req.method === 'POST' ? (parsed?.action ?? '') : ''

                // Entrada por senha removida em 28/08/2026 - espelha api/admin-data.ts.
                if (bodyAction === 'login') {
                  res.statusCode = 410
                  res.end(JSON.stringify({ error: 'A entrada por senha foi desativada. Use sua conta Google da DUX.' }))
                  return
                }

                // Login com o Google - espelha api/admin-data.ts
                if (bodyAction === 'login-google') {
                  const ip = String(
                    (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ??
                    req.socket?.remoteAddress ??
                    '0.0.0.0'
                  )
                  const blocked = await checkLoginRateLimit(db, ip)
                  if (blocked) {
                    res.statusCode = 429
                    res.end(JSON.stringify({ error: 'Muitas tentativas incorretas. Aguarde 15 minutos.' }))
                    return
                  }
                  const { configGoogle, trocarCodigoGoogle, verificarIdTokenGoogle } = await import('./api/_google-auth')
                  const cfg = configGoogle(env)
                  if (!cfg.clientId) {
                    res.statusCode = 503
                    res.end(JSON.stringify({ error: 'Login com o Google não está configurado.' }))
                    return
                  }
                  try {
                    const codigo = String(parsed?.code ?? '')
                    let idToken = String(parsed?.credential ?? '')
                    let accessToken: string | null = null
                    if (codigo) {
                      const tokens = await trocarCodigoGoogle(codigo, cfg)
                      idToken = tokens.idToken
                      accessToken = tokens.accessToken
                    }
                    const conta = await verificarIdTokenGoogle(idToken, cfg)
                    const usuario = await upsertUsuarioGoogle(db, conta, accessToken)
                    await clearLoginAttempts(db, ip)
                    const token = await createAdminSession(db, usuario.id)
                    await registrarAuditoria(db, usuario, 'login-google', usuario.email)
                    console.log('[admin-data] login-google ok:', usuario.email)
                    res.statusCode = 200
                    res.end(JSON.stringify({ token, usuario }))
                  } catch (err) {
                    console.warn('[admin-data] login-google recusado:', (err as Error).message)
                    await recordFailedLogin(db, ip)
                    res.statusCode = 401
                    res.end(JSON.stringify({ error: 'Esta conta Google não tem acesso.' }))
                  }
                  return
                }

                // Validate session
                const sessionToken = String(req.headers['x-admin-session'] ?? '')
                if (!sessionToken) {
                  res.statusCode = 401
                  res.end(JSON.stringify({ error: 'Unauthorized' }))
                  return
                }
                const sessao = await getAdminSession(db, sessionToken).catch(() => null)
                if (!sessao) {
                  res.statusCode = 401
                  res.end(JSON.stringify({ error: 'Sessão expirada.' }))
                  return
                }

                // Logout
                if (bodyAction === 'logout') {
                  await deleteAdminSession(db, sessionToken).catch(() => {})
                  res.statusCode = 200
                  res.end(JSON.stringify({ ok: true }))
                  return
                }

                process.env.RESEND_API_KEY     = process.env.RESEND_API_KEY     ?? env.RESEND_API_KEY
                process.env.RESEND_FROM_EMAIL  = process.env.RESEND_FROM_EMAIL  ?? env.RESEND_FROM_EMAIL
                // Chave-mestra p/ criptografar credenciais de integração (cofre no banco)
                process.env.APP_ENCRYPTION_KEY = process.env.APP_ENCRYPTION_KEY ?? env.APP_ENCRYPTION_KEY
                process.env.D4SIGN_CRYPT_KEY   = process.env.D4SIGN_CRYPT_KEY   ?? env.D4SIGN_CRYPT_KEY
                process.env.ANTHROPIC_API_KEY  = process.env.ANTHROPIC_API_KEY  ?? env.ANTHROPIC_API_KEY
                // Credenciais/produtos da DEPS - para a action deps_config refletir o estado real no dev local
                process.env.DEPS_EMAIL         = process.env.DEPS_EMAIL         ?? env.DEPS_EMAIL
                process.env.DEPS_SENHA         = process.env.DEPS_SENHA         ?? env.DEPS_SENHA
                process.env.DEPS_PRODUTO_PJ    = process.env.DEPS_PRODUTO_PJ    ?? env.DEPS_PRODUTO_PJ
                process.env.DEPS_PRODUTO_PF    = process.env.DEPS_PRODUTO_PF    ?? env.DEPS_PRODUTO_PF
                const result = await handleAdminData(req.method ?? 'GET', qs, parsed, db, env.SLACK_BOT_TOKEN, sessao.usuario)
                res.statusCode = result.status
                res.end(JSON.stringify(result.body))
              } catch (err) {
                console.error('[api/admin-data]', err)
                res.statusCode = 500
                res.end(JSON.stringify({ error: 'Internal error' }))
              }
            })
          })

          // /api/analise-credito - extração de documentos por IA (Análise de Crédito)
          server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
            const url = new URL(req.url ?? '/', `http://localhost`)
            if (!url.pathname.startsWith('/api/analise-credito')) return next()
            if (req.method !== 'POST') {
              res.statusCode = 405
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Method not allowed' }))
              return
            }

            let body = ''
            req.on('data', (chunk: Buffer) => { body += chunk.toString() })
            req.on('end', async () => {
              res.setHeader('Content-Type', 'application/json')
              try {
                // O handler real lê process.env - popula a partir do .env do projeto.
                // .env tem precedência sobre o ambiente do shell (que pode ter um token
                // do Claude Code inválido para chamadas diretas à API da Anthropic).
                if (env.ANTHROPIC_API_KEY)  process.env.ANTHROPIC_API_KEY  = env.ANTHROPIC_API_KEY
                if (env.TURSO_DATABASE_URL) process.env.TURSO_DATABASE_URL = env.TURSO_DATABASE_URL
                if (env.TURSO_AUTH_TOKEN)   process.env.TURSO_AUTH_TOKEN   = env.TURSO_AUTH_TOKEN

                const { default: handler } = await import('./api/analise-credito')
                const fakeReq = { method: 'POST', headers: req.headers, body: body ? JSON.parse(body) : {} } as any
                let statusCode = 200
                let responseBody = ''
                const fakeRes = {
                  setHeader: () => {},
                  status(code: number) { statusCode = code; return this },
                  json(obj: unknown) { responseBody = JSON.stringify(obj); return this },
                  end() {},
                } as any
                await handler(fakeReq, fakeRes)
                res.statusCode = statusCode
                res.end(responseBody)
              } catch (err) {
                console.error('[api/analise-credito dev]', err)
                res.statusCode = 500
                res.end(JSON.stringify({ success: false, error: String(err) }))
              }
            })
          })

          // /api/ai-parecer - parecer consultivo de crédito por IA (etapa Decisão)
          server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
            const url = new URL(req.url ?? '/', `http://localhost`)
            if (!url.pathname.startsWith('/api/ai-parecer')) return next()
            if (req.method !== 'POST') {
              res.statusCode = 405
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Method not allowed' }))
              return
            }

            let body = ''
            req.on('data', (chunk: Buffer) => { body += chunk.toString() })
            req.on('end', async () => {
              res.setHeader('Content-Type', 'application/json')
              try {
                if (env.ANTHROPIC_API_KEY)   process.env.ANTHROPIC_API_KEY   = env.ANTHROPIC_API_KEY
                if (env.TURSO_DATABASE_URL)  process.env.TURSO_DATABASE_URL  = env.TURSO_DATABASE_URL
                if (env.TURSO_AUTH_TOKEN)    process.env.TURSO_AUTH_TOKEN    = env.TURSO_AUTH_TOKEN
                if (env.APP_ENCRYPTION_KEY)  process.env.APP_ENCRYPTION_KEY  = env.APP_ENCRYPTION_KEY
                if (env.D4SIGN_CRYPT_KEY)    process.env.D4SIGN_CRYPT_KEY    = env.D4SIGN_CRYPT_KEY

                const { default: handler } = await import('./api/ai-parecer')
                const fakeReq = { method: 'POST', headers: req.headers, body: body ? JSON.parse(body) : {} } as any
                let statusCode = 200
                let responseBody = ''
                const fakeRes = {
                  setHeader: () => {},
                  status(code: number) { statusCode = code; return this },
                  json(obj: unknown) { responseBody = JSON.stringify(obj); return this },
                  end() {},
                } as any
                await handler(fakeReq, fakeRes)
                res.statusCode = statusCode
                res.end(responseBody)
              } catch (err) {
                console.error('[api/ai-parecer dev]', err)
                res.statusCode = 500
                res.end(JSON.stringify({ error: String(err) }))
              }
            })
          })

          // /api/gerar-documento - gera .docx (proposta/contrato) a partir dos templates
          server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
            const url = new URL(req.url ?? '/', `http://localhost`)
            if (!url.pathname.startsWith('/api/gerar-documento')) return next()
            if (req.method !== 'POST') {
              res.statusCode = 405; res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Method not allowed' })); return
            }
            let body = ''
            req.on('data', (chunk: Buffer) => { body += chunk.toString() })
            req.on('end', async () => {
              res.setHeader('Content-Type', 'application/json')
              try {
                if (env.TURSO_DATABASE_URL) process.env.TURSO_DATABASE_URL = env.TURSO_DATABASE_URL
                if (env.TURSO_AUTH_TOKEN)   process.env.TURSO_AUTH_TOKEN   = env.TURSO_AUTH_TOKEN
                const { default: handler } = await import('./api/gerar-documento')
                const query = Object.fromEntries(url.searchParams)
                const fakeReq = { method: 'POST', headers: req.headers, query, body: body ? JSON.parse(body) : {} } as any
                let statusCode = 200
                let responseBody = ''
                const fakeRes = {
                  setHeader: () => {},
                  status(code: number) { statusCode = code; return this },
                  json(obj: unknown) { responseBody = JSON.stringify(obj); return this },
                  end() {},
                } as any
                await handler(fakeReq, fakeRes)
                res.statusCode = statusCode
                res.end(responseBody)
              } catch (err) {
                console.error('[api/gerar-documento dev]', err)
                res.statusCode = 500
                res.end(JSON.stringify({ error: String(err) }))
              }
            })
          })

          // /api/deps-consulta - integração DEPS (login + consulta Mix)
          server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
            const url = new URL(req.url ?? '/', `http://localhost`)
            if (!url.pathname.startsWith('/api/deps-consulta')) return next()
            if (req.method !== 'POST') {
              res.statusCode = 405; res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Method not allowed' })); return
            }
            let body = ''
            req.on('data', (chunk: Buffer) => { body += chunk.toString() })
            req.on('end', async () => {
              res.setHeader('Content-Type', 'application/json')
              try {
                if (env.DEPS_EMAIL)        process.env.DEPS_EMAIL        = env.DEPS_EMAIL
                if (env.DEPS_SENHA)        process.env.DEPS_SENHA        = env.DEPS_SENHA
                if (env.DEPS_PRODUTO_PJ)   process.env.DEPS_PRODUTO_PJ   = env.DEPS_PRODUTO_PJ
                if (env.DEPS_PRODUTO_PF)   process.env.DEPS_PRODUTO_PF   = env.DEPS_PRODUTO_PF
                if (env.TURSO_DATABASE_URL) process.env.TURSO_DATABASE_URL = env.TURSO_DATABASE_URL
                if (env.TURSO_AUTH_TOKEN)   process.env.TURSO_AUTH_TOKEN   = env.TURSO_AUTH_TOKEN
                const { default: handler } = await import('./api/deps-consulta')
                const fakeReq = { method: 'POST', headers: req.headers, body: body ? JSON.parse(body) : {} } as any
                let statusCode = 200; let responseBody = ''
                const fakeRes = {
                  setHeader: () => {},
                  status(code: number) { statusCode = code; return this },
                  json(obj: unknown) { responseBody = JSON.stringify(obj); return this },
                  end() {},
                } as any
                await handler(fakeReq, fakeRes)
                res.statusCode = statusCode
                res.end(responseBody)
              } catch (err) {
                console.error('[api/deps-consulta dev]', err)
                res.statusCode = 500
                res.end(JSON.stringify({ success: false, error: String(err) }))
              }
            })
          })

          // /api/liquidez - liquidez semanal CRUD
          server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
            const url = new URL(req.url ?? '/', `http://localhost`)
            if (!url.pathname.startsWith('/api/liquidez')) return next()

            let body = ''
            req.on('data', (chunk: Buffer) => { body += chunk.toString() })
            req.on('end', async () => {
              res.setHeader('Content-Type', 'application/json')
              try {
                const { createClient } = await import('@libsql/client')
                const { randomUUID } = await import('crypto')
                const db = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN })
                const { getAdminSession, ensureAdminSchema, autoriaDe } = await import('./api/_admin-handler')
                await ensureAdminSchema(db)

                const sessionToken = String(req.headers['x-admin-session'] ?? '')
                if (!sessionToken) {
                  res.statusCode = 401
                  res.end(JSON.stringify({ error: 'Unauthorized' }))
                  return
                }
                const sessao = await getAdminSession(db, sessionToken).catch(() => null)
                if (!sessao) {
                  res.statusCode = 401
                  res.end(JSON.stringify({ error: 'Sessão expirada.' }))
                  return
                }
                const [autorId, autorNome] = autoriaDe(sessao.usuario)

                if (req.method === 'GET') {
                  const qs = url.searchParams
                  const weekStart = qs.get('week_start') ?? ''
                  const weekEnd   = qs.get('week_end')   ?? ''

                  if (qs.get('saldos') === '1') {
                    if (!weekStart) { res.statusCode = 400; res.end(JSON.stringify({ error: 'week_start é obrigatório' })); return }
                    const saldoRows = await db.execute({ sql: `SELECT source, amount FROM liquidez_saldos WHERE week_start = ?`, args: [weekStart] })
                    const saldos: Record<string, number> = {}
                    for (const r of saldoRows.rows) saldos[r.source as string] = r.amount as number
                    res.statusCode = 200
                    res.end(JSON.stringify({ saldos }))
                    return
                  }

                  if (!weekStart || !weekEnd) {
                    res.statusCode = 400
                    res.end(JSON.stringify({ error: 'week_start e week_end são obrigatórios' }))
                    return
                  }
                  const result = await db.execute({
                    sql: `SELECT * FROM liquidez_transactions WHERE date >= ? AND date <= ? ORDER BY date, created_at`,
                    args: [weekStart, weekEnd],
                  })
                  const transactions = result.rows.map(r => ({
                    id: r.id, date: r.date, source: r.source, type: r.type,
                    category: r.category, amount: r.amount, description: r.description,
                    realized: Boolean(r.realized), created_at: r.created_at,
                    criado_por_nome: r.criado_por_nome ?? null,
                    atualizado_por_nome: r.atualizado_por_nome ?? null,
                  }))
                  res.statusCode = 200
                  res.end(JSON.stringify({ transactions }))
                  return
                }

                if (req.method === 'POST') {
                  const parsed = body ? JSON.parse(body) : {}
                  const action: string = parsed.action ?? ''

                  if (action === 'create') {
                    const { date, source, type, category, amount, description } = parsed
                    if (!date || !source || !type || !category || amount == null) {
                      res.statusCode = 400
                      res.end(JSON.stringify({ error: 'Campos obrigatórios ausentes' }))
                      return
                    }
                    const id = randomUUID()
                    const now = new Date().toISOString()
                    await db.execute({
                      sql: `INSERT INTO liquidez_transactions (id, date, source, type, category, amount, description, created_at, criado_por_id, criado_por_nome) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                      args: [id, date, source, type, category, Number(amount), description ?? null, now, autorId, autorNome],
                    })
                    res.statusCode = 201
                    res.end(JSON.stringify({ ok: true, id }))
                    return
                  }

                  if (action === 'update') {
                    const { id, date, source, type, category, amount, description } = parsed
                    if (!id) { res.statusCode = 400; res.end(JSON.stringify({ error: 'id obrigatório' })); return }
                    await db.execute({
                      sql: `UPDATE liquidez_transactions SET date=?, source=?, type=?, category=?, amount=?, description=?, atualizado_por_id=?, atualizado_por_nome=?, atualizado_em=? WHERE id=?`,
                      args: [date, source, type, category, Number(amount), description ?? null, autorId, autorNome, new Date().toISOString(), id],
                    })
                    res.statusCode = 200
                    res.end(JSON.stringify({ ok: true }))
                    return
                  }

                  if (action === 'delete') {
                    const { id } = parsed
                    if (!id) { res.statusCode = 400; res.end(JSON.stringify({ error: 'id obrigatório' })); return }
                    await db.execute({ sql: `DELETE FROM liquidez_transactions WHERE id=?`, args: [id] })
                    res.statusCode = 200
                    res.end(JSON.stringify({ ok: true }))
                    return
                  }

                  if (action === 'toggle_realized') {
                    const { id } = parsed
                    if (!id) { res.statusCode = 400; res.end(JSON.stringify({ error: 'id obrigatório' })); return }
                    await db.execute({
                      sql: `UPDATE liquidez_transactions SET realized = CASE WHEN realized = 1 THEN 0 ELSE 1 END, atualizado_por_id = ?, atualizado_por_nome = ?, atualizado_em = ? WHERE id = ?`,
                      args: [autorId, autorNome, new Date().toISOString(), id],
                    })
                    const row = await db.execute({ sql: `SELECT realized FROM liquidez_transactions WHERE id = ?`, args: [id] })
                    res.statusCode = 200
                    res.end(JSON.stringify({ ok: true, realized: Boolean(row.rows[0]?.realized) }))
                    return
                  }

                  if (action === 'set_saldo') {
                    const { week_start, source, amount } = parsed
                    if (!week_start || !source || amount == null) { res.statusCode = 400; res.end(JSON.stringify({ error: 'week_start, source e amount são obrigatórios' })); return }
                    const now = new Date().toISOString()
                    await db.execute({
                      sql: `INSERT INTO liquidez_saldos (week_start, source, amount, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(week_start, source) DO UPDATE SET amount=excluded.amount, updated_at=excluded.updated_at`,
                      args: [week_start, source, Number(amount), now],
                    })
                    res.statusCode = 200
                    res.end(JSON.stringify({ ok: true }))
                    return
                  }

                  res.statusCode = 400
                  res.end(JSON.stringify({ error: 'action inválida' }))
                  return
                }

                res.statusCode = 405
                res.end(JSON.stringify({ error: 'Method not allowed' }))
              } catch (err) {
                console.error('[api/liquidez]', err)
                res.statusCode = 500
                res.end(JSON.stringify({ error: 'Internal error' }))
              }
            })
          })

          // /api/relatorios - operações reais lidas do Google Sheets
          server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
            const url = new URL(req.url ?? '/', `http://localhost`)
            if (!url.pathname.startsWith('/api/relatorios')) return next()
            ;(async () => {
              res.setHeader('Content-Type', 'application/json')
              try {
                // O handler real lê process.env - popula a partir do .env do projeto.
                if (env.GOOGLE_SA_EMAIL)       process.env.GOOGLE_SA_EMAIL       = env.GOOGLE_SA_EMAIL
                if (env.GOOGLE_SA_PRIVATE_KEY) process.env.GOOGLE_SA_PRIVATE_KEY = env.GOOGLE_SA_PRIVATE_KEY
                if (env.RELATORIOS_SHEET_ID)   process.env.RELATORIOS_SHEET_ID   = env.RELATORIOS_SHEET_ID
                if (env.RELATORIOS_SHEET_ABA)  process.env.RELATORIOS_SHEET_ABA  = env.RELATORIOS_SHEET_ABA
                if (env.TURSO_DATABASE_URL)    process.env.TURSO_DATABASE_URL    = env.TURSO_DATABASE_URL
                if (env.TURSO_AUTH_TOKEN)      process.env.TURSO_AUTH_TOKEN      = env.TURSO_AUTH_TOKEN

                const { default: handler } = await import('./api/relatorios')
                const query: Record<string, string> = {}
                url.searchParams.forEach((v, k) => { query[k] = v })
                const fakeReq = { method: req.method ?? 'GET', headers: req.headers, query } as any
                let statusCode = 200
                let responseBody = ''
                const fakeRes = {
                  setHeader: () => {},
                  status(code: number) { statusCode = code; return this },
                  json(obj: unknown) { responseBody = JSON.stringify(obj); return this },
                  end() {},
                } as any
                await handler(fakeReq, fakeRes)
                res.statusCode = statusCode
                res.end(responseBody)
              } catch (err) {
                console.error('[api/relatorios dev]', err)
                res.statusCode = 500
                res.end(JSON.stringify({ error: String(err) }))
              }
            })()
          })

          // /api/d4sign - D4Sign document creation and status polling
          server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
            const url = new URL(req.url ?? '/', `http://localhost`)
            if (!url.pathname.startsWith('/api/d4sign')) return next()

            res.setHeader('Content-Type', 'application/json')
            // Sem CORS, espelhando api/d4sign.ts: mesma origem, nada a liberar.

            const action = url.searchParams.get('action') ?? ''
            const sessionToken = String(req.headers['x-admin-session'] ?? '')

            /** Sessão do painel, exigida nas duas ações (falam com a conta da empresa). */
            const comSessao = async () => {
              if (!sessionToken) return false
              const { createClient } = await import('@libsql/client')
              const db = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN })
              const { getAdminSession } = await import('./api/_admin-handler')
              return !!(await getAdminSession(db, sessionToken).catch(() => null))
            }

            if (req.method === 'GET' && action === 'status') {
              const uuid = url.searchParams.get('uuid') ?? ''
              if (!uuid) { res.statusCode = 400; res.end(JSON.stringify({ error: 'uuid required' })); return }
              ;(async () => {
                if (!await comSessao()) { res.statusCode = 401; res.end(JSON.stringify({ error: 'Unauthorized' })); return }
                const BASE  = env.D4SIGN_BASE_URL  ?? 'https://secure.d4sign.com.br/api/v1'
                const TOKEN = env.D4SIGN_API_KEY   ?? ''
                const CRYPT = env.D4SIGN_CRYPT_KEY ?? ''
                const r = await fetch(`${BASE}/documents/${uuid}?tokenAPI=${TOKEN}&cryptKey=${CRYPT}`)
                const data = await r.json()
                const statusId = Number(data.statusId ?? data.uuidStatus ?? data.status_id ?? 0)
                const status = statusId === 3 ? 'signed' : statusId === 4 ? 'canceled' : 'pending'
                res.end(JSON.stringify({ status, statusId }))
              })().catch(err => { res.statusCode = 500; res.end(JSON.stringify({ error: String(err) })) })
              return
            }

            if (req.method === 'POST' && action === 'create') {
              let body = ''
              req.on('data', (chunk: Buffer) => { body += chunk.toString() })
              req.on('end', async () => {
                try {
                  const { operacao } = JSON.parse(body)
                  // Forward to the api/d4sign handler logic by importing it
                  const { default: handler } = await import('./api/d4sign')
                  // O shim precisa levar os headers: é neles que vai a sessão
                  // que o handler agora exige.
                  const fakeReq = { method: 'POST', query: { action: 'create' }, body: { operacao }, headers: req.headers } as any
                  let statusCode = 200
                  let responseBody = ''
                  const fakeRes = {
                    setHeader: () => {},
                    status(code: number) { statusCode = code; return this },
                    json(obj: unknown) { responseBody = JSON.stringify(obj); return this },
                    end() {},
                  } as any
                  await handler(fakeReq, fakeRes)
                  res.statusCode = statusCode
                  res.end(responseBody)
                } catch (err) {
                  console.error('[api/d4sign dev]', err)
                  res.statusCode = 500
                  res.end(JSON.stringify({ error: String(err) }))
                }
              })
              return
            }

            res.statusCode = 405
            res.end(JSON.stringify({ error: 'Method not allowed' }))
          })

          // /api/slack-users
          server.middlewares.use('/api/slack-users', (req: IncomingMessage, res: ServerResponse) => {
            if (req.method !== 'GET') {
              res.statusCode = 405
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Method not allowed' }))
              return
            }

            const sessionToken = String(req.headers['x-admin-session'] ?? '')

            ;(async () => {
              const { createClient } = await import('@libsql/client')
              const db = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN })
              const { validateAdminSession } = await import('./api/_admin-handler')
              const valid = await validateAdminSession(db, sessionToken).catch(() => false)
              if (!valid) {
                res.statusCode = 401
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ error: 'Unauthorized' }))
                return
              }
              res.setHeader('Content-Type', 'application/json')
              try {
                const r = await fetch('https://slack.com/api/users.list?limit=200', {
                  headers: { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}` },
                })
                const data = await r.json() as { ok: boolean; members?: any[] }
                if (!data.ok) { res.statusCode = 500; res.end(JSON.stringify({ error: 'Slack error' })); return }
                const users = (data.members ?? [])
                  .filter((m: any) => !m.is_bot && !m.deleted && m.id !== 'USLACKBOT' && !m.is_restricted)
                  .map((m: any) => ({ id: m.id, name: m.real_name || m.name, username: m.name, avatar: m.profile?.image_48 ?? null }))
                  .sort((a: any, b: any) => a.name.localeCompare(b.name))
                res.end(JSON.stringify({ users }))
              } catch (err) {
                console.error('[api/slack-users]', err)
                res.statusCode = 500
                res.end(JSON.stringify({ error: 'Internal error' }))
              }
            })()
          })

          server.middlewares.use('/api/slack', (req: IncomingMessage, res: ServerResponse) => {
            if (req.method !== 'POST') {
              res.statusCode = 405
              res.end(JSON.stringify({ error: 'Method not allowed' }))
              return
            }

            let body = ''
            req.on('data', (chunk: Buffer) => { body += chunk.toString() })
            req.on('end', async () => {
              res.setHeader('Content-Type', 'application/json')
              try {
                const { data, fimType, arquivosCount } = JSON.parse(body)
                if (!data) {
                  res.statusCode = 400
                  res.end(JSON.stringify({ error: 'Missing data' }))
                  return
                }

                const token = env.SLACK_BOT_TOKEN

                const { createClient } = await import('@libsql/client')
                const db = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN })
                const { getNovaSubmissaoRecipients } = await import('./api/_admin-handler')
                const recipients = await getNovaSubmissaoRecipients(db)

                if (recipients.length === 0) {
                  res.end(JSON.stringify({ ok: true }))
                  return
                }

                const FIM_LABELS: Record<number, string> = {
                  1: 'Escrow direto na operação',
                  2: 'Pagamento direto / Domicílio bancário',
                  3: 'Escrow na nota + aceite via email',
                }

                async function slackCall(method: string, payload: Record<string, unknown>) {
                  const r = await fetch(`https://slack.com/api/${method}`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                  })
                  return r.json() as Promise<{ ok: boolean; ts?: string; error?: string; channel?: { id: string } }>
                }

                const row = (l1: string, v1: string, l2: string, v2: string) => ({
                  type: 'section',
                  text: { type: 'mrkdwn', text: `*${l1}*   |   *${l2}*\n${v1}   |   ${v2}` },
                })

                const blocks: unknown[] = [
                  { type: 'header', text: { type: 'plain_text', text: '✅ Nova solicitação recebida', emoji: true } },
                  row('Empresa Contratado', data.nomeContratado ?? '-', 'Empresa Sacado', data.nomeSacado ?? '-'),
                  row('CNPJ Contratado', data.cnpjContratado ?? '-', 'CNPJ Sacado', data.cnpjSacado ?? '-'),
                  { type: 'divider' },
                  row('Valor', data.valor ?? '-', 'Prazo limite', data.prazoLimite ?? '-'),
                ]

                if (fimType) {
                  blocks.push({ type: 'section', text: {
                    type: 'mrkdwn', text: `*Fluxo*\n${FIM_LABELS[fimType] ?? `FIM ${fimType}`}`,
                  }})
                }

                blocks.push({ type: 'divider' })

                const ctx: unknown[] = [{ type: 'mrkdwn', text: '✅ Formulário completo e enviado' }]
                if (arquivosCount && arquivosCount > 0) {
                  ctx.push({ type: 'mrkdwn', text: `📎 ${arquivosCount} arquivo${arquivosCount !== 1 ? 's' : ''} enviado${arquivosCount !== 1 ? 's' : ''}` })
                }
                blocks.push({ type: 'context', elements: ctx })

                const message = {
                  text: `✅ Nova solicitação - ${data.nomeContratado ?? data.cnpjContratado ?? '-'}`,
                  blocks,
                }

                for (const userId of recipients) {
                  let channel = userId
                  if (userId.startsWith('U')) {
                    const open = await slackCall('conversations.open', { users: userId })
                    if (open.ok && open.channel?.id) channel = open.channel.id
                  }
                  const result = await slackCall('chat.postMessage', { channel, ...message })
                  if (!result.ok) console.error('[api/slack]', result.error)
                }

                res.end(JSON.stringify({ ok: true }))
              } catch (err) {
                console.error('[api/slack]', err)
                res.statusCode = 500
                res.end(JSON.stringify({ error: 'Internal error' }))
              }
            })
          })
        },
      },
    ],
  }
})
