import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, ArrowDownRight, ArrowUpRight, BarChart3, Bell, BellRing, ChevronDown,
  CircleHelp, LayoutDashboard, Menu, MoreHorizontal, Search,
  Star, WalletCards, X,
} from 'lucide-react'
import CoinChart from './components/CoinChart'
import WatchlistPage from './components/WatchlistPage'
import MarketScreenerPage from './components/MarketScreenerPage'
import PortfolioPage from './components/PortfolioPage'
import PriceAlertsPage from './components/PriceAlertsPage'
import {
  addWatchlist, createPriceAlert, deletePriceAlert, fetchMarket, fetchOhlc, fetchPriceAlerts, fetchWatchlist, removeWatchlist, updatePriceAlert,
  type Candle, type Coin, type PriceAlert, type PriceAlertInput, type PriceAlertPayload, type WatchlistCoin,
} from './lib/api'

const periods = [
  { label: '1D', days: 1 },
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: '180D', days: 180 },
  { label: '1Y', days: 365 },
]

const money = (value: number | null | undefined, digits = 2) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: value >= 1 ? digits : 6,
  }).format(value)
}

const compactMoney = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 2 }).format(value)
}

function Change({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined || !Number.isFinite(value)) return <span className="muted">—</span>
  const positive = value >= 0
  return (
    <span className={`change ${positive ? 'positive' : 'negative'}`}>
      {positive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
      {Math.abs(value).toFixed(2)}%
    </span>
  )
}

function CoinAvatar({ coin, size = 'normal' }: { coin: { image?: string; symbol: string }; size?: 'normal' | 'large' }) {
  return coin.image ? (
    <img className={`coin-avatar ${size}`} src={coin.image} alt="" loading="lazy" />
  ) : (
    <div className={`coin-avatar fallback ${size}`}>{coin.symbol.slice(0, 1).toUpperCase()}</div>
  )
}

export default function App() {
  const [coins, setCoins] = useState<Coin[]>([])
  const [watchlist, setWatchlist] = useState<WatchlistCoin[]>([])
  const [selectedCoin, setSelectedCoin] = useState('bitcoin')
  const [timeframe, setTimeframe] = useState(30)
  const [chartType, setChartType] = useState<'candles' | 'line'>('candles')
  const [chartData, setChartData] = useState<Candle[]>([])
  const [query, setQuery] = useState('')
  const [marketLoading, setMarketLoading] = useState(true)
  const [chartLoading, setChartLoading] = useState(true)
  const [marketError, setMarketError] = useState('')
  const [chartError, setChartError] = useState('')
  const [chartWarning, setChartWarning] = useState('')
  const [marketWarning, setMarketWarning] = useState('')
  const [source, setSource] = useState('')
  const [savingCoin, setSavingCoin] = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [activePage, setActivePage] = useState<'overview' | 'markets' | 'watchlist' | 'portfolio' | 'alerts'>('overview')
  const [watchlistError, setWatchlistError] = useState('')
  const [alerts, setAlerts] = useState<PriceAlert[]>([])
  const [alertSummary, setAlertSummary] = useState<PriceAlertPayload['summary']>({ total: 0, active: 0, triggered: 0, paused: 0 })
  const [alertsLoading, setAlertsLoading] = useState(true)
  const [alertsSaving, setAlertsSaving] = useState(false)
  const [alertError, setAlertError] = useState('')
  const [alertNotice, setAlertNotice] = useState('')
  const [marketSnapshotAt, setMarketSnapshotAt] = useState<string | null>(null)
  const [marketSnapshotFresh, setMarketSnapshotFresh] = useState(false)
  const knownTriggeredIds = useRef<Set<string> | null>(null)
  const marketRequestInFlight = useRef(false)
  const alertsRequestInFlight = useRef(false)
  const alertNoticeTimer = useRef<number | null>(null)
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(() => typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)

  const loadMarket = useCallback(async (showLoader = false) => {
    if (marketRequestInFlight.current) return
    marketRequestInFlight.current = true
    if (showLoader) setMarketLoading(true)
    try {
      const result = await fetchMarket()
      setCoins(result.results)
      setSource(result.source)
      setMarketWarning(result.warning || (result.stale ? 'Showing a saved market snapshot.' : ''))
      setMarketError('')
    } catch (error) {
      setMarketError(error instanceof Error ? error.message : 'Unable to load market data.')
    } finally {
      marketRequestInFlight.current = false
      setMarketLoading(false)
    }
  }, [])

  const loadWatchlist = useCallback(async () => {
    try {
      const result = await fetchWatchlist()
      setWatchlist(result.results)
      setWatchlistError('')
    } catch (error) {
      setWatchlistError(error instanceof Error ? error.message : 'Unable to load your watchlist.')
    }
  }, [])

  const applyAlertsPayload = useCallback((payload: PriceAlertPayload) => {
    const nextTriggeredIds = new Set(payload.results.filter((alert) => alert.status === 'triggered').map((alert) => alert.id))
    const previouslyTriggered = knownTriggeredIds.current
    if (previouslyTriggered) {
      const newlyTriggered = payload.results.filter((alert) => alert.status === 'triggered' && !previouslyTriggered.has(alert.id))
      if (newlyTriggered.length) {
        const first = newlyTriggered[0]
        const message = `${first.symbol.toUpperCase()} price alert triggered at ${money(Number(first.triggered_price), Number(first.triggered_price) < 1 ? 6 : 2)}.`
        setAlertNotice(message)
        if (alertNoticeTimer.current !== null) window.clearTimeout(alertNoticeTimer.current)
        alertNoticeTimer.current = window.setTimeout(() => {
          setAlertNotice('')
          alertNoticeTimer.current = null
        }, 7000)
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          newlyTriggered.forEach((alert) => {
            const observed = alert.triggered_price ? money(Number(alert.triggered_price), Number(alert.triggered_price) < 1 ? 6 : 2) : 'target price reached'
            new Notification(`Nova Terminal · ${alert.symbol.toUpperCase()}`, {
              body: `${alert.name} ${alert.condition === 'ABOVE' ? 'reached or rose above' : 'reached or fell below'} ${money(Number(alert.target_price), Number(alert.target_price) < 1 ? 6 : 2)}. Observed: ${observed}.`,
              icon: alert.image || undefined,
            })
          })
        }
      }
    }
    knownTriggeredIds.current = nextTriggeredIds
    setAlerts(payload.results)
    setAlertSummary(payload.summary)
    setMarketSnapshotAt(payload.market_snapshot_at)
    setMarketSnapshotFresh(payload.market_snapshot_fresh)
  }, [])

  const loadAlerts = useCallback(async (showLoader = false) => {
    if (alertsRequestInFlight.current) return
    alertsRequestInFlight.current = true
    if (showLoader) setAlertsLoading(true)
    try {
      const result = await fetchPriceAlerts()
      applyAlertsPayload(result)
      setAlertError('')
    } catch (error) {
      setAlertError(error instanceof Error ? error.message : 'Unable to load price alerts.')
    } finally {
      alertsRequestInFlight.current = false
      setAlertsLoading(false)
    }
  }, [applyAlertsPayload])

  const enableBrowserNotifications = useCallback(async () => {
    if (typeof Notification === 'undefined') {
      setNotificationPermission('unsupported')
      return
    }
    const permission = await Notification.requestPermission()
    setNotificationPermission(permission)
  }, [])

  useEffect(() => () => {
    if (alertNoticeTimer.current !== null) window.clearTimeout(alertNoticeTimer.current)
  }, [])

  useEffect(() => {
    void loadMarket(true)
    void loadWatchlist()
    const timer = window.setInterval(() => void loadMarket(false), 60_000)
    return () => window.clearInterval(timer)
  }, [loadMarket, loadWatchlist])

  useEffect(() => {
    void loadAlerts(true)
    const timer = window.setInterval(() => void loadAlerts(false), 30_000)
    return () => window.clearInterval(timer)
  }, [loadAlerts])

  useEffect(() => {
    let cancelled = false
    setChartLoading(true)
    setChartError('')
    setChartWarning('')
    fetchOhlc(selectedCoin, timeframe)
      .then((result) => {
        if (!cancelled) {
          setChartData(result.results)
          setChartWarning(result.warning || '')
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setChartData([])
          setChartError(error instanceof Error ? error.message : 'Unable to load chart data.')
        }
      })
      .finally(() => { if (!cancelled) setChartLoading(false) })
    return () => { cancelled = true }
  }, [selectedCoin, timeframe])

  const selected = useMemo(() => {
    const marketCoin = coins.find((coin) => coin.id === selectedCoin)
    if (marketCoin) return marketCoin
    const savedCoin = watchlist.find((coin) => coin.id === selectedCoin)
    if (!savedCoin) return undefined
    return {
      id: savedCoin.id, name: savedCoin.name, symbol: savedCoin.symbol, image: savedCoin.image,
      current_price: null, market_cap: null, market_cap_rank: null, total_volume: null,
      price_change_percentage_24h: null, last_updated: null, fetched_at: savedCoin.added_at,
    } satisfies Coin
  }, [coins, selectedCoin, watchlist])
  const watchedIds = useMemo(() => new Set(watchlist.map((coin) => coin.id)), [watchlist])
  const filteredCoins = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return coins
    return coins.filter((coin) => coin.name.toLowerCase().includes(normalized) || coin.symbol.toLowerCase().includes(normalized))
  }, [coins, query])
  const gainers = coins.filter((coin) => (coin.price_change_percentage_24h ?? 0) > 0).length
  const trackedVolume = coins.reduce((total, coin) => total + (coin.total_volume ?? 0), 0)
  const todayLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "2-digit", year: "numeric" }).toUpperCase()
  const selectedChange = selected?.price_change_percentage_24h ?? null

  const toggleWatchlist = async (coin: Coin) => {
    setSavingCoin(coin.id)
    try {
      if (watchedIds.has(coin.id)) await removeWatchlist(coin.id)
      else await addWatchlist(coin)
      await loadWatchlist()
    } catch (error) {
      setMarketWarning(error instanceof Error ? error.message : 'Could not update watchlist.')
    } finally {
      setSavingCoin('')
    }
  }

  const createAlert = async (input: PriceAlertInput) => {
    setAlertsSaving(true)
    try {
      const payload = await createPriceAlert(input)
      applyAlertsPayload(payload)
      setAlertError('')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not create price alert.'
      setAlertError(message)
      throw new Error(message)
    } finally {
      setAlertsSaving(false)
    }
  }

  const updateAlert = async (id: string, input: { is_active?: boolean; condition?: 'ABOVE' | 'BELOW'; target_price?: string }) => {
    setAlertsSaving(true)
    try {
      const payload = await updatePriceAlert(id, input)
      applyAlertsPayload(payload)
      setAlertError('')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update price alert.'
      setAlertError(message)
      throw new Error(message)
    } finally {
      setAlertsSaving(false)
    }
  }

  const deleteAlert = async (id: string) => {
    setAlertsSaving(true)
    try {
      const payload = await deletePriceAlert(id)
      applyAlertsPayload(payload)
      setAlertError('')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not delete price alert.'
      setAlertError(message)
      throw new Error(message)
    } finally {
      setAlertsSaving(false)
    }
  }

  const selectCoin = (coin: Coin | WatchlistCoin) => {
    setSelectedCoin(coin.id)
    setMobileOpen(false)
  }

  const openWatchlistCoin = (coin: WatchlistCoin) => {
    selectCoin(coin)
    setActivePage('overview')
  }

  const removeWatchlistItem = async (coinId: string) => {
    setSavingCoin(coinId)
    try {
      await removeWatchlist(coinId)
      await loadWatchlist()
    } catch (error) {
      setWatchlistError(error instanceof Error ? error.message : 'Could not remove this asset.')
    } finally {
      setSavingCoin('')
    }
  }

  const navigateToMarkets = () => {
    setActivePage('markets')
    setMobileOpen(false)
  }

  const openMarketCoin = (coin: Coin) => {
    selectCoin(coin)
    setActivePage('overview')
  }

  return (
    <div className="app-frame">
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <div className="brand-row">
          <div className="brand-mark"><Activity size={20} strokeWidth={2.4} /></div>
          <div><div className="brand-name">NOVA<span>TERMINAL</span></div><div className="brand-caption">PERSONAL MARKET DESK</div></div>
          <button className="icon-button sidebar-close" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X size={18} /></button>
        </div>

        <div className="side-label">WORKSPACE</div>
        <button className={`nav-item ${activePage === 'overview' ? 'active' : ''}`} aria-current={activePage === 'overview' ? 'page' : undefined} onClick={() => { setActivePage('overview'); setMobileOpen(false) }}><LayoutDashboard size={17} /> Overview {activePage === 'overview' && <span className="nav-dot" />}</button>
        <button className={`nav-item ${activePage === 'markets' ? 'active' : ''}`} aria-current={activePage === 'markets' ? 'page' : undefined} onClick={navigateToMarkets}><BarChart3 size={17} /> Markets {activePage === 'markets' && <span className="nav-dot" />}</button>
        <button className={`nav-item ${activePage === 'watchlist' ? 'active' : ''}`} aria-current={activePage === 'watchlist' ? 'page' : undefined} onClick={() => { setActivePage('watchlist'); setMobileOpen(false) }}><Star size={17} /> Watchlist <span className="nav-count">{watchlist.length}</span></button>
        <button className={`nav-item ${activePage === 'alerts' ? 'active' : ''}`} aria-current={activePage === 'alerts' ? 'page' : undefined} onClick={() => { setActivePage('alerts'); setMobileOpen(false) }}><BellRing size={17} /> Price Alerts <span className="nav-count">{alertSummary.active}</span></button>
        <button className={`nav-item ${activePage === 'portfolio' ? 'active' : ''}`} aria-current={activePage === 'portfolio' ? 'page' : undefined} onClick={() => { setActivePage('portfolio'); setMobileOpen(false) }}><WalletCards size={17} /> Portfolio {activePage === 'portfolio' && <span className="nav-dot" />}</button>

        <div className="side-divider" />
        <div className="side-label">YOUR WATCHLIST</div>
        <div className="side-watchlist" id="watchlist">
          {watchlist.length === 0 && <p className="side-empty">Save assets with the star icon to keep them here.</p>}
          {watchlist.slice(0, 7).map((coin) => (
            <button className={`watchlist-item ${selectedCoin === coin.id ? 'selected' : ''}`} key={coin.id} onClick={() => { selectCoin(coin); setActivePage('overview') }}>
              <CoinAvatar coin={coin} />
              <span className="watchlist-name">{coin.symbol.toUpperCase()}</span>
              <span className="watchlist-sub">{coin.name}</span>
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="profile-card"><div className="profile-avatar">N</div><div className="profile-copy"><strong>Personal workspace</strong><span>Local environment</span></div><MoreHorizontal size={17} /></div>
          <div className="sidebar-foot"><span className="status-dot" /> PRIVATE LOCAL INSTANCE</div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-left"><button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu size={20} /></button><div className="breadcrumb">Workspace <span>/</span> <strong>{activePage === 'watchlist' ? 'Watchlist' : activePage === 'markets' ? 'Markets' : activePage === 'portfolio' ? 'Portfolio' : activePage === 'alerts' ? 'Price Alerts' : 'Overview'}</strong></div></div>
          <div className="topbar-right"><div className="market-status"><span className="status-dot" /> MARKET DATA</div><button className="icon-button top-alert-button" aria-label="Open price alerts" title="Open price alerts" onClick={() => { setActivePage('alerts'); setMobileOpen(false) }}><Bell size={17} />{alertSummary.triggered > 0 && <span className="top-alert-dot" />}</button><div className="top-avatar">N</div></div>
        </header>

        <div className="page-content">
          {alertNotice && <button className="price-alert-toast" onClick={() => { setActivePage('alerts'); setAlertNotice('') }}><BellRing size={14} /> {alertNotice}<span>View</span></button>}
          {activePage === 'alerts' ? (
            <PriceAlertsPage
              market={coins}
              alerts={alerts}
              summary={alertSummary}
              loading={alertsLoading}
              saving={alertsSaving}
              error={alertError}
              snapshotAt={marketSnapshotAt}
              snapshotFresh={marketSnapshotFresh}
              notificationPermission={notificationPermission}
              onRefresh={() => void Promise.all([loadMarket(true), loadAlerts(true)])}
              onCreate={createAlert}
              onUpdate={updateAlert}
              onDelete={deleteAlert}
              onEnableNotifications={enableBrowserNotifications}
            />
          ) : activePage === 'portfolio' ? (
            <PortfolioPage
              market={coins}
              onSelectCoin={(coinId) => { setSelectedCoin(coinId); setActivePage('overview') }}
              onRefreshMarket={() => loadMarket(true)}
            />
          ) : activePage === 'watchlist' ? (
            <WatchlistPage
              watchlist={watchlist}
              market={coins}
              loading={marketLoading}
              savingCoin={savingCoin}
              error={watchlistError}
              onRefresh={() => { void loadMarket(true); void loadWatchlist() }}
              onRemove={(coinId) => { void removeWatchlistItem(coinId) }}
              onSelect={openWatchlistCoin}
              onBrowseMarkets={navigateToMarkets}
            />
          ) : activePage === 'markets' ? (
            <MarketScreenerPage
              coins={coins}
              loading={marketLoading}
              error={marketError}
              warning={marketWarning}
              selectedCoin={selectedCoin}
              watchedIds={watchedIds}
              savingCoin={savingCoin}
              onRefresh={() => void loadMarket(true)}
              onSelect={openMarketCoin}
              onToggleWatchlist={(coin) => { void toggleWatchlist(coin) }}
            />
          ) : (
            <>
          <div className="page-heading">
            <div><div className="eyebrow">{todayLabel} <span className="eyebrow-line" /></div><h1>Market overview<span className="heading-period">.</span></h1><p className="page-subtitle">A clear view of the crypto market, all in one place.</p></div>
            <button className="refresh-button" onClick={() => void loadMarket(true)}><Activity size={15} /> Refresh data</button>
          </div>

          {marketWarning && <div className="notice warning"><CircleHelp size={15} /> {marketWarning}</div>}
          {marketError && <div className="notice error"><CircleHelp size={15} /> {marketError} <span>Make sure Django is running and your CoinGecko key is configured.</span></div>}

          <section className="stats-grid">
            <div className="stat-card"><div className="stat-top"><span>Tracked assets</span><span className="stat-icon"><BarChart3 size={16} /></span></div><div className="stat-value">{marketLoading ? '—' : coins.length || '—'}</div><div className="stat-foot">Top 100 by market cap</div></div>
            <div className="stat-card"><div className="stat-top"><span>Market volume</span><span className="stat-icon"><Activity size={16} /></span></div><div className="stat-value">{marketLoading ? '—' : compactMoney(trackedVolume)}</div><div className="stat-foot">Combined 24h volume · tracked assets</div></div>
            <div className="stat-card"><div className="stat-top"><span>Positive movers</span><span className="stat-icon green"><ArrowUpRight size={16} /></span></div><div className="stat-value">{marketLoading ? '—' : `${gainers} / ${coins.length}`}</div><div className="stat-foot">Assets up over the last 24 hours</div></div>
            <div className="stat-card"><div className="stat-top"><span>Data connection</span><span className="stat-icon"><Activity size={16} /></span></div><div className="stat-value connection-value">{source === 'coingecko_demo' ? 'Connected' : source === 'mongodb_snapshot' ? 'Cached' : 'Waiting'}</div><div className="stat-foot">{source === 'coingecko_demo' ? 'CoinGecko Demo API' : source === 'mongodb_snapshot' ? 'MongoDB market snapshot' : 'Awaiting API configuration'}</div></div>
          </section>

          <section className="chart-card">
            <div className="panel-heading chart-heading">
              <div className="asset-heading">
                {selected ? <CoinAvatar coin={selected} size="large" /> : <div className="coin-avatar fallback large">₿</div>}
                <div><div className="asset-name">{selected?.name ?? 'Bitcoin'} <span className="asset-symbol">{selected?.symbol.toUpperCase() ?? 'BTC'}/USD</span></div><div className="asset-price-row"><strong>{selected ? money(selected.current_price, selected.current_price && selected.current_price < 1 ? 6 : 2) : '—'}</strong>{selected && <Change value={selectedChange} />}</div></div>
              </div>
              <div className="chart-controls"><div className="segmented-control"><button className={chartType === 'candles' ? 'selected' : ''} onClick={() => setChartType('candles')}>Candles</button><button className={chartType === 'line' ? 'selected' : ''} onClick={() => setChartType('line')}>Line</button></div></div>
            </div>
            <div className="chart-toolbar"><div className="timeframes">{periods.map((period) => <button key={period.label} className={timeframe === period.days ? 'selected' : ''} onClick={() => setTimeframe(period.days)}>{period.label}</button>)}</div><div className="chart-unit">USD <ChevronDown size={13} /></div></div>
            <CoinChart data={chartData} chartType={chartType} loading={chartLoading} assetId={selectedCoin} />
            {chartError && <div className="chart-error">{chartError}</div>}
            {chartWarning && <div className="chart-warning">{chartWarning}</div>}
            <div className="chart-footer"><span><span className="status-dot" /> {chartData.length ? `${chartData.length} OHLC candles · ${chartData.filter((item) => typeof item.volume_24h === 'number').length} 24h volume observations` : 'Waiting for chart data'}</span><span>24h market volume from CoinGecko · Lightweight Charts by TradingView</span></div>
          </section>

          <section className="market-card" id="market-table">
            <div className="panel-heading market-heading"><div><h2>Top cryptocurrency</h2><p>Market leaders ranked by market capitalization</p></div><div className="table-actions"><label className="search-box"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search assets..." /><kbd>/</kbd></label><span className="filter-button"><BarChart3 size={14} /> Top 100</span></div></div>
            <div className="table-scroll"><table><thead><tr><th className="rank-col">#</th><th className="asset-col">Asset</th><th>Price</th><th>24h change</th><th>Market cap</th><th>Volume (24h)</th><th className="save-col" /></tr></thead><tbody>
              {marketLoading && coins.length === 0 && Array.from({ length: 6 }).map((_, index) => <tr key={index}><td colSpan={7}><div className="table-skeleton" /></td></tr>)}
              {!marketLoading && filteredCoins.map((coin) => (
                <tr key={coin.id} className={selectedCoin === coin.id ? 'row-selected' : ''} tabIndex={0} aria-label={`Open ${coin.name} chart`} onClick={() => selectCoin(coin)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectCoin(coin) } }}>
                  <td className="rank-col">{coin.market_cap_rank ?? '—'}</td><td><div className="table-asset"><CoinAvatar coin={coin} /><div><strong>{coin.name}</strong><span>{coin.symbol.toUpperCase()}</span></div></div></td><td className="number-cell">{money(coin.current_price, coin.current_price && coin.current_price < 1 ? 6 : 2)}</td><td><Change value={coin.price_change_percentage_24h} /></td><td className="number-cell">{compactMoney(coin.market_cap)}</td><td className="number-cell">{compactMoney(coin.total_volume)}</td><td className="save-col"><button className={`star-button ${watchedIds.has(coin.id) ? 'saved' : ''}`} aria-label={watchedIds.has(coin.id) ? 'Remove from watchlist' : 'Add to watchlist'} disabled={savingCoin === coin.id} onClick={(event) => { event.stopPropagation(); void toggleWatchlist(coin) }}><Star size={16} fill={watchedIds.has(coin.id) ? 'currentColor' : 'none'} /></button></td>
                </tr>
              ))}
              {!marketLoading && filteredCoins.length === 0 && <tr><td colSpan={7} className="empty-table">{marketError ? 'Market data is unavailable.' : 'No assets match your search.'}</td></tr>}
            </tbody></table></div>
            <div className="table-bottom"><span>Showing {filteredCoins.length} of {coins.length} assets</span><span>Ranked by market cap <ChevronDown size={13} /></span></div>
          </section>

          <footer className="page-footer"><span>© 2026 Nova Terminal · Personal project</span><span>Market data by <strong>CoinGecko</strong> <span className="footer-separator">·</span> Not financial advice</span></footer>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
