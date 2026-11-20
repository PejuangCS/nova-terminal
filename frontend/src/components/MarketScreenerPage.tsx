import { useMemo, useState } from 'react'
import {
  ArrowDownRight,
  ArrowDownUp,
  ArrowUpRight,
  Filter,
  RefreshCw,
  RotateCcw,
  Search,
  Star,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react'
import type { Coin } from '../lib/api'

type QuickFilter = 'all' | 'gainers' | 'losers' | 'high-volume' | 'large-cap'
type SortKey = 'rank' | 'market_cap' | 'volume' | 'change' | 'price'
type SortOrder = 'asc' | 'desc'

type Props = {
  coins: Coin[]
  loading: boolean
  error: string
  warning: string
  selectedCoin: string
  watchedIds: Set<string>
  savingCoin: string
  onRefresh: () => void
  onSelect: (coin: Coin) => void
  onToggleWatchlist: (coin: Coin) => void
}

const usd = (value: number | null | undefined, compact = false) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: compact ? 2 : value >= 1 ? 2 : 8,
  }).format(value)
}

const numericValue = (value: string) => {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function CoinAvatar({ coin }: { coin: Coin }) {
  return coin.image ? (
    <img className="coin-avatar" src={coin.image} alt="" loading="lazy" />
  ) : (
    <div className="coin-avatar fallback">{coin.symbol.slice(0, 1).toUpperCase()}</div>
  )
}

function Change({ value }: { value: number | null }) {
  if (value === null || !Number.isFinite(value)) return <span className="muted">—</span>
  const positive = value >= 0
  return (
    <span className={`change ${positive ? 'positive' : 'negative'}`}>
      {positive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
      {Math.abs(value).toFixed(2)}%
    </span>
  )
}

export default function MarketScreenerPage({
  coins,
  loading,
  error,
  warning,
  selectedCoin,
  watchedIds,
  savingCoin,
  onRefresh,
  onSelect,
  onToggleWatchlist,
}: Props) {
  const [query, setQuery] = useState('')
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all')
  const [sortBy, setSortBy] = useState<SortKey>('rank')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [maxRank, setMaxRank] = useState('100')
  const [minMarketCap, setMinMarketCap] = useState('')
  const [minVolume, setMinVolume] = useState('')
  const [minChange, setMinChange] = useState('')

  const highVolumeThreshold = useMemo(() => {
    const values = coins
      .map((coin) => coin.total_volume)
      .filter((value): value is number => value !== null && Number.isFinite(value))
      .sort((a, b) => b - a)
    if (values.length === 0) return null
    return values[Math.min(values.length - 1, Math.floor(values.length * 0.2))]
  }, [coins])

  const filteredCoins = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const rankLimit = numericValue(maxRank)
    const marketCapFloor = numericValue(minMarketCap)
    const volumeFloor = numericValue(minVolume)
    const changeFloor = numericValue(minChange)

    const filtered = coins.filter((coin) => {
      if (normalized && ![coin.name, coin.symbol, coin.id].some((value) => value.toLowerCase().includes(normalized))) return false
      if (rankLimit !== null && (coin.market_cap_rank === null || coin.market_cap_rank > rankLimit)) return false
      if (marketCapFloor !== null && (coin.market_cap === null || coin.market_cap < marketCapFloor)) return false
      if (volumeFloor !== null && (coin.total_volume === null || coin.total_volume < volumeFloor)) return false
      if (changeFloor !== null && (coin.price_change_percentage_24h === null || coin.price_change_percentage_24h < changeFloor)) return false

      const change = coin.price_change_percentage_24h
      if (quickFilter === 'gainers' && (change === null || change <= 0)) return false
      if (quickFilter === 'losers' && (change === null || change >= 0)) return false
      if (quickFilter === 'high-volume' && (highVolumeThreshold === null || coin.total_volume === null || coin.total_volume < highVolumeThreshold)) return false
      if (quickFilter === 'large-cap' && (coin.market_cap_rank === null || coin.market_cap_rank > 20)) return false
      return true
    })

    const valueFor = (coin: Coin): number | null => {
      switch (sortBy) {
        case 'rank': return coin.market_cap_rank
        case 'market_cap': return coin.market_cap
        case 'volume': return coin.total_volume
        case 'change': return coin.price_change_percentage_24h
        case 'price': return coin.current_price
      }
    }
    return filtered.sort((a, b) => {
      const aValue = valueFor(a)
      const bValue = valueFor(b)
      if (aValue === null && bValue === null) return a.name.localeCompare(b.name)
      if (aValue === null) return 1
      if (bValue === null) return -1
      return (aValue - bValue) * (sortOrder === 'asc' ? 1 : -1)
    })
  }, [coins, query, quickFilter, highVolumeThreshold, maxRank, minMarketCap, minVolume, minChange, sortBy, sortOrder])

  const gainers = coins.filter((coin) => (coin.price_change_percentage_24h ?? 0) > 0).length
  const losers = coins.filter((coin) => (coin.price_change_percentage_24h ?? 0) < 0).length
  const trackedMarketCap = coins.reduce((total, coin) => total + (coin.market_cap ?? 0), 0)
  const filtersActive = Boolean(query || quickFilter !== 'all' || maxRank !== '100' || minMarketCap || minVolume || minChange)

  const resetFilters = () => {
    setQuery('')
    setQuickFilter('all')
    setMaxRank('100')
    setMinMarketCap('')
    setMinVolume('')
    setMinChange('')
    setSortBy('rank')
    setSortOrder('asc')
  }

  const changeSort = (value: SortKey) => {
    setSortBy(value)
    setSortOrder(value === 'rank' ? 'asc' : 'desc')
  }

  return (
    <>
      <div className="page-heading screener-page-heading">
        <div>
          <div className="eyebrow">MARKET INTELLIGENCE <span className="eyebrow-line" /></div>
          <h1>Market screener<span className="heading-period">.</span></h1>
          <p className="page-subtitle">Find market opportunities across the tracked Top 100 crypto assets.</p>
        </div>
        <div className="screener-heading-actions">
          <span className="screener-source"><span className="status-dot" /> COINGECKO · TOP 100</span>
          <button className="refresh-button" onClick={onRefresh} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin-icon' : ''} /> Refresh data
          </button>
        </div>
      </div>

      {warning && <div className="notice warning"><Filter size={14} /> {warning}</div>}
      {error && <div className="notice error"><Filter size={14} /> {error} <span>Check that Django is running and the market snapshot is available.</span></div>}

      <section className="screener-stats-grid">
        <div className="screener-stat-card"><span>Assets in screener</span><strong>{loading && coins.length === 0 ? '—' : coins.length}</strong><small>Current Top 100 snapshot</small></div>
        <div className="screener-stat-card"><span>Gainers · 24h</span><strong className="positive-text"><TrendingUp size={16} /> {gainers}</strong><small>Assets with positive change</small></div>
        <div className="screener-stat-card"><span>Losers · 24h</span><strong className="negative-text"><TrendingDown size={16} /> {losers}</strong><small>Assets with negative change</small></div>
        <div className="screener-stat-card"><span>Tracked market cap</span><strong>{usd(trackedMarketCap, true)}</strong><small>Combined value of tracked assets</small></div>
      </section>

      <section className="screener-filter-card">
        <div className="screener-search-row">
          <label className="search-box screener-search">
            <Search size={15} />
            <input value={query} onChange={(event: { target: { value: string } }) => setQuery(event.target.value)} placeholder="Search by coin name, symbol, or ID..." />
            {query && <button className="clear-search-button" onClick={() => setQuery('')} aria-label="Clear search"><X size={13} /></button>}
          </label>
          <label className="screener-sort-control">
            <span>Sort by</span>
            <select value={sortBy} onChange={(event: { target: { value: string } }) => changeSort(event.target.value as SortKey)}>
              <option value="rank">Market rank</option>
              <option value="market_cap">Market cap</option>
              <option value="volume">24h volume</option>
              <option value="change">24h change</option>
              <option value="price">Price</option>
            </select>
          </label>
          <button className="screener-order-button" onClick={() => setSortOrder((current) => current === 'asc' ? 'desc' : 'asc')} title={sortOrder === 'asc' ? 'Ascending order' : 'Descending order'} aria-label="Toggle sort direction">
            <ArrowDownUp size={14} /><span>{sortOrder === 'asc' ? 'Ascending' : 'Descending'}</span>
          </button>
          <button className={`screener-advanced-button ${advancedOpen ? 'active' : ''}`} onClick={() => setAdvancedOpen((open) => !open)}>
            <Filter size={14} /> Filters
          </button>
        </div>

        <div className="screener-preset-row" role="group" aria-label="Quick market filters">
          {([
            ['all', 'All assets'],
            ['gainers', 'Gainers'],
            ['losers', 'Losers'],
            ['high-volume', 'High volume'],
            ['large-cap', 'Top 20 market cap'],
          ] as [QuickFilter, string][]).map(([value, label]) => (
            <button key={value} className={`screener-preset ${quickFilter === value ? 'selected' : ''}`} onClick={() => setQuickFilter(value)}>{label}</button>
          ))}
          {filtersActive && <button className="screener-reset-button" onClick={resetFilters}><RotateCcw size={12} /> Reset filters</button>}
        </div>

        {advancedOpen && (
          <div className="screener-advanced-grid">
            <label className="screener-field"><span>Maximum market rank</span><input type="number" min="1" max="100" value={maxRank} onChange={(event: { target: { value: string } }) => setMaxRank(event.target.value)} placeholder="100" /></label>
            <label className="screener-field"><span>Minimum market cap (USD)</span><input type="number" min="0" value={minMarketCap} onChange={(event: { target: { value: string } }) => setMinMarketCap(event.target.value)} placeholder="e.g. 1000000000" /></label>
            <label className="screener-field"><span>Minimum 24h volume (USD)</span><input type="number" min="0" value={minVolume} onChange={(event: { target: { value: string } }) => setMinVolume(event.target.value)} placeholder="e.g. 50000000" /></label>
            <label className="screener-field"><span>Minimum 24h change (%)</span><input type="number" step="0.1" value={minChange} onChange={(event: { target: { value: string } }) => setMinChange(event.target.value)} placeholder="e.g. -5" /></label>
          </div>
        )}
        <div className="screener-filter-foot"><span><Filter size={12} /> {filteredCoins.length} of {coins.length} assets match your filters</span><span>Filters use the latest available market snapshot</span></div>
      </section>

      <section className="market-card screener-results-card">
        <div className="panel-heading market-heading screener-results-heading">
          <div><h2>Market results</h2><p>Click an asset to open its chart in Overview.</p></div>
          <span className="screener-result-count">{filteredCoins.length} RESULTS</span>
        </div>
        <div className="table-scroll">
          <table className="screener-table">
            <thead><tr><th className="rank-col">#</th><th className="asset-col">Asset</th><th>Price</th><th>24h change</th><th>Market cap</th><th>Volume (24h)</th><th className="save-col">Watchlist</th></tr></thead>
            <tbody>
              {loading && coins.length === 0 && Array.from({ length: 7 }).map((_, index) => <tr key={`skeleton-${index}`}><td colSpan={7}><div className="table-skeleton" /></td></tr>)}
              {!loading && filteredCoins.map((coin) => (
                <tr key={coin.id} className={selectedCoin === coin.id ? 'row-selected' : ''} onClick={() => onSelect(coin)}>
                  <td className="rank-col">{coin.market_cap_rank ?? '—'}</td>
                  <td><div className="table-asset"><CoinAvatar coin={coin} /><div><strong>{coin.name}</strong><span>{coin.symbol.toUpperCase()}</span></div></div></td>
                  <td className="number-cell">{usd(coin.current_price)}</td>
                  <td><Change value={coin.price_change_percentage_24h} /></td>
                  <td className="number-cell">{usd(coin.market_cap, true)}</td>
                  <td className="number-cell">{usd(coin.total_volume, true)}</td>
                  <td className="save-col"><button className={`star-button ${watchedIds.has(coin.id) ? 'saved' : ''}`} aria-label={watchedIds.has(coin.id) ? 'Remove from watchlist' : 'Add to watchlist'} disabled={savingCoin === coin.id} onClick={(event: { stopPropagation: () => void }) => { event.stopPropagation(); onToggleWatchlist(coin) }}><Star size={16} fill={watchedIds.has(coin.id) ? 'currentColor' : 'none'} /></button></td>
                </tr>
              ))}
              {!loading && filteredCoins.length === 0 && <tr><td colSpan={7} className="empty-table">{error ? 'Market data is unavailable.' : 'No assets match the current filters.'}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="table-bottom"><span>Showing {filteredCoins.length} of {coins.length} tracked assets</span><span>Source: CoinGecko market snapshot</span></div>
      </section>

      <footer className="page-footer"><span>© 2026 Nova Terminal · Personal project</span><span>Market data by <strong>CoinGecko</strong> <span className="footer-separator">·</span> Not financial advice</span></footer>
    </>
  )
}
