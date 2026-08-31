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
                const sub = await db.execute({ sql: 'SELECT * FROM leads WHERE id = ?', args: [id] })
                if (sub.rows.length === 0) {
                  res.statusCode = 404
                  res.end(JSON.stringify({ error: 'Not found' }))
                  return
                }
                const arqs = await db.execute({
                  sql: 'SELECT id, categoria, nome, tipo, tamanho, base64 FROM lead_arquivos WHERE lead_id = ?',
                  args: [id],
                })
                res.end(JSON.stringify({ submission: sub.rows[0], arquivos: arqs.rows }))
              } else {
                const result = await db.execute(`
                  SELECT s.*, COUNT(a.id) AS arquivo_count
                  FROM leads s
                  LEFT JOIN lead_arquivos a ON a.lead_id = s.id
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
                  CREATE TABLE IF NOT EXISTS leads (
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
                try { await db.execute(`ALTER TABLE leads ADD COLUMN parcelas TEXT`) } catch {}
                try { await db.execute(`ALTER TABLE leads ADD COLUMN previsao_execucao TEXT`) } catch {}
                try { await db.execute(`ALTER TABLE leads ADD COLUMN data_execucao TEXT`) } catch {}

                await db.execute(`
                  CREATE TABLE IF NOT EXISTS lead_arquivos (
                    id             INTEGER PRIMARY KEY AUTOINCREMENT,
                    lead_id TEXT NOT NULL,
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
                  sql: `INSERT INTO leads (
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
                      sql: `INSERT INTO lead_eventos (lead_id, tipo, status_id, descricao, criado_em)
                            VALUES (?, 'status_change', ?, 'Lead recebida', ?)`,
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
                res.end(JSON.stringify({ error: 'Erro ao salvar lead. Tente novamente.' }))
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
                const { leadId, arquivo } = JSON.parse(body)
                if (!leadId || !arquivo?.base64 || !arquivo.nome) {
                  res.statusCode = 400
                  res.end(JSON.stringify({ error: 'Dados ausentes.' }))
                  return
                }

                const { createClient } = await import('@libsql/client')
                const db = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN })

                const row = await db.execute({ sql: 'SELECT id FROM leads WHERE id = ? LIMIT 1', args: [leadId] })
                if (row.rows.length === 0) {
                  res.statusCode = 404
                  res.end(JSON.stringify({ error: 'Lead não encontrada.' }))
                  return
                }

                await db.execute({
                  sql: `INSERT INTO lead_arquivos (lead_id, categoria, nome, tipo, tamanho, base64)
                        VALUES (?, ?, ?, ?, ?, ?)`,
                  args: [leadId, arquivo.categoria ?? '', arquivo.nome, arquivo.tipo ?? '', arquivo.tamanho ?? 0, arquivo.base64],
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
                const result = await handleAdminData(req.method ?? 'GET', qs, parsed, db, sessao.usuario)
                res.statusCode = result.status
                res.end(JSON.stringify(result.body))
              } catch (err) {
                console.error('[api/admin-data]', err)
                res.statusCode = 500
                res.end(JSON.stringify({ error: 'Internal error' }))
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

        },
      },
    ],
  }
})
