export type Coin = {
  id: string
  symbol: string
  name: string
  image: string
  current_price: number | null
  market_cap: number | null
  market_cap_rank: number | null
  total_volume: number | null
  price_change_percentage_24h: number | null
  last_updated: string | null
  fetched_at: string
}

export type Candle = {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume_24h?: number | null
}

export type WatchlistCoin = {
  id: string
  name: string
  symbol: string
  image: string
  added_at: string
}

async function request(path: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(path, { ...init, signal: controller.signal })
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('Request timed out. Pastikan backend Django berjalan dan coba lagi.')
    }
    if (error instanceof TypeError) {
      throw new Error('Tidak dapat terhubung ke backend. Pastikan Django berjalan di 127.0.0.1:8000.')
    }
    throw error
  } finally {
    globalThis.clearTimeout(timeoutId)
  }
}

async function readJson<T>(response: Response): Promise<T> {
  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    // Non-JSON responses are reported using the HTTP status below.
  }
  if (!response.ok) {
    const detail = payload && typeof payload === 'object' && 'detail' in payload
      ? (payload as { detail?: unknown }).detail
      : null
    throw new Error(typeof detail === 'string' ? detail : `Request gagal (${response.status})`)
  }
  return payload as T
}

export async function fetchMarket() {
  const response = await request('/api/market/coins/', {}, 25_000)
  return readJson<{ results: Coin[]; source: string; stale: boolean; warning?: string; fetched_at?: string }>(response)
}

export async function fetchOhlc(coinId: string, days: number) {
  const response = await request(`/api/market/coins/${encodeURIComponent(coinId)}/ohlc/?days=${days}`, {}, 45_000)
  return readJson<{ results: Candle[]; source: string; warning?: string }>(response)
}

export async function fetchWatchlist() {
  const response = await request('/api/watchlist/')
  return readJson<{ results: WatchlistCoin[] }>(response)
}

export async function addWatchlist(coin: Coin) {
  const response = await request('/api/watchlist/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: coin.id, name: coin.name, symbol: coin.symbol, image: coin.image }),
  })
  return readJson<WatchlistCoin>(response)
}

export async function removeWatchlist(coinId: string) {
  const response = await request(`/api/watchlist/${encodeURIComponent(coinId)}/`, { method: 'DELETE' })
  if (!response.ok && response.status !== 204) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.detail || `Request gagal (${response.status})`)
  }
}

export type PortfolioHolding = {
  coin_id: string
  name: string
  symbol: string
  image: string
  quantity: string
  average_buy_price: string
  current_price: string | null
  market_value: string | null
  cost_basis: string
  unrealized_pnl: string | null
  realized_pnl: string
  price_change_percentage_24h: number | null
  market_cap_rank: number | null
  allocation_percentage: string
  has_market_data: boolean
}

export type PortfolioTransaction = {
  id: string
  coin_id: string
  name: string
  symbol: string
  image: string
  type: 'BUY' | 'SELL'
  quantity: string
  price: string
  fee: string
  currency: 'USD'
  executed_at: string
  notes: string
  cash_total: string
  realized_pnl: string | null
  created_at: string
  updated_at: string
}

export type PortfolioPayload = {
  summary: {
    current_value: string
    cost_basis: string
    unrealized_pnl: string
    realized_pnl: string
    total_pnl: string
    total_fees: string
    holdings_count: number
    transactions_count: number
    unpriced_holdings: number
  }
  holdings: PortfolioHolding[]
  transactions: PortfolioTransaction[]
  currency: 'USD'
  cost_method: 'weighted_average'
  market_snapshot_note: string
}

export type PortfolioTransactionInput = {
  coin_id: string
  name: string
  symbol: string
  image: string
  type: 'BUY' | 'SELL'
  quantity: string
  price: string
  fee: string
  currency: 'USD'
  executed_at: string
  notes: string
}

export async function fetchPortfolio() {
  const response = await request('/api/portfolio/')
  return readJson<PortfolioPayload>(response)
}

export async function createPortfolioTransaction(input: PortfolioTransactionInput) {
  const response = await request('/api/portfolio/transactions/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return readJson<PortfolioPayload>(response)
}

export async function updatePortfolioTransaction(id: string, input: PortfolioTransactionInput) {
  const response = await request(`/api/portfolio/transactions/${encodeURIComponent(id)}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return readJson<PortfolioPayload>(response)
}

export async function deletePortfolioTransaction(id: string) {
  const response = await request(`/api/portfolio/transactions/${encodeURIComponent(id)}/`, {
    method: 'DELETE',
  })
  return readJson<PortfolioPayload>(response)
}

export type PriceAlertCondition = 'ABOVE' | 'BELOW'
export type PriceAlertStatus = 'active' | 'triggered' | 'paused'

export type PriceAlert = {
  id: string
  coin_id: string
  name: string
  symbol: string
  image: string
  condition: PriceAlertCondition
  target_price: string
  current_price: string | null
  price_available: boolean
  price_is_fresh: boolean
  is_active: boolean
  status: PriceAlertStatus
  triggered_at: string | null
  triggered_price: string | null
  created_at: string
  updated_at: string
}

export type PriceAlertPayload = {
  results: PriceAlert[]
  summary: { total: number; active: number; triggered: number; paused: number }
  market_snapshot_at: string | null
  market_snapshot_fresh: boolean
  market_refresh_seconds: number
  evaluation_mode: 'latest_mongodb_snapshot'
}

export type PriceAlertInput = {
  coin_id: string
  condition: PriceAlertCondition
  target_price: string
}

export async function fetchPriceAlerts() {
  const response = await request('/api/alerts/')
  return readJson<PriceAlertPayload>(response)
}

export async function createPriceAlert(input: PriceAlertInput) {
  const response = await request('/api/alerts/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return readJson<PriceAlertPayload>(response)
}

export async function updatePriceAlert(id: string, input: { is_active?: boolean; condition?: PriceAlertCondition; target_price?: string }) {
  const response = await request(`/api/alerts/${encodeURIComponent(id)}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return readJson<PriceAlertPayload>(response)
}

export async function deletePriceAlert(id: string) {
  const response = await request(`/api/alerts/${encodeURIComponent(id)}/`, { method: 'DELETE' })
  return readJson<PriceAlertPayload>(response)
}
