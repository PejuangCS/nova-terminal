import { useMemo, useState } from 'react'
import {
  ArrowDownRight, ArrowUpRight, ArrowUpDown, RefreshCw, Search, Star, Trash2,
} from 'lucide-react'
import type { Coin, WatchlistCoin } from '../lib/api'

type WatchlistRow = WatchlistCoin & {
  current_price: number | null
  price_change_percentage_24h: number | null
  market_cap: number | null
  total_volume: number | null
  market_cap_rank: number | null
  has_market_data: boolean
}

type Props = {
  watchlist: WatchlistCoin[]
  market: Coin[]
  loading: boolean
  savingCoin: string
  error: string
  onRefresh: () => void
  onRemove: (coinId: string) => void
  onSelect: (coin: WatchlistCoin) => void
  onBrowseMarkets: () => void
}

const money = (value: number | null | undefined, digits = 2) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: value >= 1 ? digits : 6,
  }).format(value)
}

const compactMoney = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 2,
  }).format(value)
}

function CoinAvatar({ coin }: { coin: Pick<WatchlistCoin, 'image' | 'symbol'> }) {
  return coin.image ? (
    <img className="coin-avatar" src={coin.image} alt="" loading="lazy" />
  ) : (
    <div className="coin-avatar fallback">{coin.symbol.slice(0, 1).toUpperCase()}</div>
  )
}

function Change({ value }: { value: number | null }) {
  if (value === null) return <span className="muted">—</span>
  const positive = value >= 0
  return (
    <span className={`change ${positive ? 'positive' : 'negative'}`}>
      {positive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
      {Math.abs(value).toFixed(2)}%
    </span>
  )
}

export default function WatchlistPage({
  watchlist, market, loading, savingCoin, error, onRefresh, onRemove, onSelect, onBrowseMarkets,
}: Props) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'rank' | 'change' | 'name'>('rank')

  const rows = useMemo(() => {
    const marketById = new Map(market.map((coin) => [coin.id, coin]))
    const normalized = query.trim().toLowerCase()
    const merged: WatchlistRow[] = watchlist.map((item) => {
      const coin = marketById.get(item.id)
      return {
        ...item,
        current_price: coin?.current_price ?? null,
        price_change_percentage_24h: coin?.price_change_percentage_24h ?? null,
        market_cap: coin?.market_cap ?? null,
        total_volume: coin?.total_volume ?? null,
        market_cap_rank: coin?.market_cap_rank ?? null,
        has_market_data: Boolean(coin),
      }
    }).filter((coin) => (
      !normalized || coin.name.toLowerCase().includes(normalized) || coin.symbol.toLowerCase().includes(normalized)
    ))

    return merged.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name)
      if (sort === 'change') return (b.price_change_percentage_24h ?? -Infinity) - (a.price_change_percentage_24h ?? -Infinity)
      return (a.market_cap_rank ?? Number.MAX_SAFE_INTEGER) - (b.market_cap_rank ?? Number.MAX_SAFE_INTEGER)
    })
  }, [market, query, sort, watchlist])

  const pricedRows = rows.filter((coin) => coin.price_change_percentage_24h !== null)
  const gainers = pricedRows.filter((coin) => (coin.price_change_percentage_24h ?? 0) > 0).length
  const losers = pricedRows.filter((coin) => (coin.price_change_percentage_24h ?? 0) < 0).length
  const averageChange = pricedRows.length
    ? pricedRows.reduce((total, coin) => total + (coin.price_change_percentage_24h ?? 0), 0) / pricedRows.length
    : null

  const dateLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: '2-digit', year: 'numeric',
  }).toUpperCase()

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">{dateLabel} <span className="eyebrow-line" /></div>
          <h1>Your watchlist<span className="heading-period">.</span></h1>
          <p className="page-subtitle">A focused view of the assets you want to keep an eye on.</p>
        </div>
        <button className="refresh-button" onClick={onRefresh} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spin-icon' : ''} /> Refresh data
        </button>
      </div>

      {error && <div className="notice error">{error}</div>}

      <section className="stats-grid watchlist-stats">
        <div className="stat-card">
          <div className="stat-top"><span>Saved assets</span><span className="stat-icon"><Star size={15} /></span></div>
          <div className="stat-value">{watchlist.length}</div>
          <div className="stat-foot">Stored in your local MongoDB database</div>
        </div>
        <div className="stat-card">
          <div className="stat-top"><span>Positive movers</span><span className="stat-icon green"><ArrowUpRight size={16} /></span></div>
          <div className="stat-value">{gainers}</div>
          <div className="stat-foot">Of {pricedRows.length} saved assets with market data</div>
        </div>
        <div className="stat-card">
          <div className="stat-top"><span>Negative movers</span><span className="stat-icon red"><ArrowDownRight size={16} /></span></div>
          <div className="stat-value">{losers}</div>
          <div className="stat-foot">Down over the last 24 hours</div>
        </div>
        <div className="stat-card">
          <div className="stat-top"><span>Average 24h change</span><span className="stat-icon"><ActivityIcon /></span></div>
          <div className="stat-value"><Change value={averageChange} /></div>
          <div className="stat-foot">Average of saved assets with available market data</div>
        </div>
      </section>

      <section className="market-card watchlist-card">
        <div className="panel-heading market-heading watchlist-heading">
          <div>
            <h2>Saved assets</h2>
            <p>Prices are matched against the latest Top 100 market snapshot.</p>
          </div>
          <div className="table-actions watchlist-actions">
            <label className="search-box watchlist-search">
              <Search size={15} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search watchlist..." />
            </label>
            <label className="sort-control">
              <ArrowUpDown size={13} />
              <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label="Sort watchlist">
                <option value="rank">Market rank</option>
                <option value="change">24h change</option>
                <option value="name">Name</option>
              </select>
            </label>
          </div>
        </div>

        <div className="table-scroll">
          <table className="watchlist-table">
            <thead>
              <tr>
                <th className="rank-col">#</th>
                <th className="asset-col">Asset</th>
                <th>Price</th>
                <th>24h change</th>
                <th>Market cap</th>
                <th>Volume (24h)</th>
                <th className="watchlist-action-col">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && watchlist.length === 0 && Array.from({ length: 3 }).map((_, index) => (
                <tr key={`skeleton-${index}`}><td colSpan={7}><div className="table-skeleton" /></td></tr>
              ))}
              {!loading && rows.map((coin) => (
                <tr key={coin.id} onClick={() => onSelect(coin)} title="Open this asset in the market chart">
                  <td className="rank-col">{coin.market_cap_rank ?? '—'}</td>
                  <td>
                    <div className="table-asset">
                      <CoinAvatar coin={coin} />
                      <div><strong>{coin.name}</strong><span>{coin.symbol.toUpperCase()}</span></div>
                    </div>
                  </td>
                  <td className="number-cell">{money(coin.current_price, coin.current_price !== null && coin.current_price < 1 ? 6 : 2)}</td>
                  <td><Change value={coin.price_change_percentage_24h} /></td>
                  <td className="number-cell">{compactMoney(coin.market_cap)}</td>
                  <td className="number-cell">{compactMoney(coin.total_volume)}</td>
                  <td className="watchlist-action-col">
                    <button
                      className="remove-watch-button"
                      aria-label={`Remove ${coin.name} from watchlist`}
                      title="Remove from watchlist"
                      disabled={savingCoin === coin.id}
                      onClick={(event) => { event.stopPropagation(); onRemove(coin.id) }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={7} className="empty-table">
                  {watchlist.length === 0 ? 'Your watchlist is empty. Add assets from the Markets table.' : 'No saved assets match your search.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        {!loading && rows.some((coin) => !coin.has_market_data) && (
          <div className="watchlist-note">
            Market statistics are only shown for assets included in the current Top 100 snapshot.
          </div>
        )}

        {watchlist.length === 0 && !loading && (
          <div className="watchlist-empty-action">
            <div className="watchlist-empty-icon"><Star size={20} /></div>
            <div><strong>Build your watchlist</strong><span>Use the star icon beside any asset in Markets to save it here.</span></div>
            <button className="refresh-button" onClick={onBrowseMarkets}>Browse markets</button>
          </div>
        )}

        <div className="table-bottom">
          <span>Showing {rows.length} of {watchlist.length} saved assets</span>
          <span>Click an asset to open its chart</span>
        </div>
      </section>

      <footer className="page-footer">
        <span>© 2026 Nova Terminal · Personal project</span>
        <span>Market data by <strong>CoinGecko</strong> <span className="footer-separator">·</span> Not financial advice</span>
      </footer>
    </>
  )
}

function ActivityIcon() {
  return <span className="activity-pulse" aria-hidden="true" />
}
