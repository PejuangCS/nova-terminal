import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  ArrowDownRight, ArrowUpRight, Bell, CheckCircle2, CircleAlert,
  Clock3, Info, Pause, Play, Plus, RefreshCw, ShieldCheck, Trash2,
} from 'lucide-react'
import type {
  Coin, PriceAlert, PriceAlertCondition, PriceAlertInput,
  PriceAlertPayload,
} from '../lib/api'

type Props = {
  market: Coin[]
  alerts: PriceAlert[]
  summary: PriceAlertPayload['summary']
  loading: boolean
  saving: boolean
  error: string
  snapshotAt: string | null
  snapshotFresh: boolean
  notificationPermission: NotificationPermission | 'unsupported'
  onRefresh: () => void
  onCreate: (input: PriceAlertInput) => Promise<void>
  onUpdate: (id: string, input: { is_active?: boolean; condition?: PriceAlertCondition; target_price?: string }) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onEnableNotifications: () => Promise<void>
}

const usd = (value: number | string | null | undefined) => {
  if (value === null || value === undefined || value === '') return '—'
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: number >= 1 ? 2 : 8,
  }).format(number)
}

const formatDate = (value: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-US', {
    month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function CoinAvatar({ image, symbol }: { image: string; symbol: string }) {
  return image
    ? <img className="coin-avatar" src={image} alt="" loading="lazy" />
    : <div className="coin-avatar fallback">{symbol.slice(0, 1).toUpperCase()}</div>
}

function StatusBadge({ alert, snapshotFresh }: { alert: PriceAlert; snapshotFresh: boolean }) {
  if (alert.status === 'triggered') {
    return <span className="price-alert-status triggered"><CheckCircle2 size={12} /> Triggered</span>
  }
  if (alert.status === 'paused') {
    return <span className="price-alert-status paused"><Pause size={11} /> Paused</span>
  }
  if (!alert.price_available) {
    return <span className="price-alert-status waiting"><Clock3 size={11} /> Waiting for price</span>
  }
  if (!snapshotFresh || !alert.price_is_fresh) {
    return <span className="price-alert-status waiting"><Clock3 size={11} /> Stale snapshot</span>
  }
  return <span className="price-alert-status active"><span className="status-dot" /> Active</span>
}

export default function PriceAlertsPage({
  market, alerts, summary, loading, saving, error, snapshotAt, snapshotFresh,
  notificationPermission, onRefresh, onCreate, onUpdate, onDelete, onEnableNotifications,
}: Props) {
  const [coinId, setCoinId] = useState('')
  const [condition, setCondition] = useState<PriceAlertCondition>('ABOVE')
  const [targetPrice, setTargetPrice] = useState('')
  const [formError, setFormError] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'triggered' | 'paused'>('all')
  const [query, setQuery] = useState('')

  const selectedCoin = market.find((coin) => coin.id === coinId)

  useEffect(() => {
    if (!coinId && market.length) {
      const preferred = market.find((coin) => coin.id === 'bitcoin') ?? market[0]
      setCoinId(preferred.id)
    }
  }, [coinId, market])

  const visibleAlerts = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return alerts.filter((alert) => {
      const matchesFilter = filter === 'all' || alert.status === filter
      const matchesQuery = !normalized || [alert.name, alert.symbol, alert.coin_id].some((value) => value.toLowerCase().includes(normalized))
      return matchesFilter && matchesQuery
    })
  }, [alerts, filter, query])

  const submitAlert = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const price = Number(targetPrice)
    if (!selectedCoin) {
      setFormError('Pilih aset dari market snapshot terlebih dahulu.')
      return
    }
    if (!targetPrice.trim() || !Number.isFinite(price) || price <= 0) {
      setFormError('Masukkan target harga yang lebih besar dari 0.')
      return
    }
    setFormError('')
    try {
      await onCreate({ coin_id: selectedCoin.id, condition, target_price: targetPrice.trim() })
      setTargetPrice('')
    } catch (submitError) {
      setFormError(submitError instanceof Error ? submitError.message : 'Tidak dapat membuat price alert.')
    }
  }

  const handleDelete = async (alert: PriceAlert) => {
    const confirmed = window.confirm(`Hapus alert ${alert.symbol.toUpperCase()} ${alert.condition.toLowerCase()} ${usd(alert.target_price)}?`)
    if (confirmed) {
      try { await onDelete(alert.id) } catch { /* The parent displays the API error. */ }
    }
  }

  const notificationLabel = notificationPermission === 'granted'
    ? 'Browser notifications enabled'
    : notificationPermission === 'denied'
      ? 'Notifications blocked by browser'
      : notificationPermission === 'unsupported'
        ? 'Browser notifications unavailable'
        : 'Enable browser notifications'

  return (
    <div className="price-alerts-page">
      <div className="page-heading price-alerts-heading">
        <div>
          <div className="eyebrow">MARKET MONITORING <span className="eyebrow-line" /></div>
          <h1>Price alerts<span className="heading-period">.</span></h1>
          <p className="page-subtitle">Create one-shot alerts for assets in your tracked market snapshot.</p>
        </div>
        <div className="price-alerts-heading-actions">
          <button className="refresh-button" onClick={onRefresh} disabled={loading}><RefreshCw size={14} /> Refresh</button>
          <button
            className={`price-alert-notification-button ${notificationPermission === 'granted' ? 'enabled' : ''}`}
            onClick={() => void onEnableNotifications()}
            disabled={notificationPermission === 'granted' || notificationPermission === 'unsupported'}
            title={notificationLabel}
          >
            {notificationPermission === 'granted' ? <ShieldCheck size={14} /> : <Bell size={14} />}
            {notificationLabel}
          </button>
        </div>
      </div>

      {error && <div className="notice error"><CircleAlert size={14} /> {error}</div>}

      <section className="price-alert-stats">
        <div className="portfolio-stat-card"><div className="portfolio-stat-top"><span>Total alerts</span><span className="portfolio-stat-icon"><Bell size={15} /></span></div><strong>{summary.total}</strong><small>All saved price rules</small></div>
        <div className="portfolio-stat-card"><div className="portfolio-stat-top"><span>Active</span><span className="portfolio-stat-icon positive"><span className="status-dot" /></span></div><strong>{summary.active}</strong><small>Waiting for target price</small></div>
        <div className="portfolio-stat-card"><div className="portfolio-stat-top"><span>Triggered</span><span className="portfolio-stat-icon positive"><CheckCircle2 size={15} /></span></div><strong>{summary.triggered}</strong><small>One-shot alerts matched</small></div>
        <div className="portfolio-stat-card"><div className="portfolio-stat-top"><span>Paused</span><span className="portfolio-stat-icon"><Pause size={15} /></span></div><strong>{summary.paused}</strong><small>Not currently monitoring</small></div>
      </section>

      <section className="price-alert-create-card">
        <div className="price-alert-section-heading">
          <div><div className="eyebrow">NEW RULE</div><h2>Create price alert</h2><p>Choose an asset and the price level you want to monitor.</p></div>
          <span className="price-alert-heading-icon"><Plus size={18} /></span>
        </div>
        <form onSubmit={(event) => void submitAlert(event)}>
          <div className="price-alert-form-grid">
            <label className="price-alert-field">
              <span>Cryptocurrency</span>
              <select value={coinId} onChange={(event) => setCoinId(event.target.value)} disabled={!market.length || saving}>
                {!market.length && <option value="">Market snapshot unavailable</option>}
                {market.map((coin) => <option value={coin.id} key={coin.id}>{coin.name} ({coin.symbol.toUpperCase()})</option>)}
              </select>
              {selectedCoin && <small>Current price: {usd(selectedCoin.current_price)}</small>}
            </label>
            <div className="price-alert-field">
              <span>Condition</span>
              <div className="price-alert-condition-switch">
                <button type="button" className={condition === 'ABOVE' ? 'selected above' : ''} onClick={() => setCondition('ABOVE')} disabled={saving}><ArrowUpRight size={13} /> Rises above</button>
                <button type="button" className={condition === 'BELOW' ? 'selected below' : ''} onClick={() => setCondition('BELOW')} disabled={saving}><ArrowDownRight size={13} /> Falls below</button>
              </div>
              <small>Triggers when the latest market price meets or crosses the target.</small>
            </div>
            <label className="price-alert-field">
              <span>Target price <small>USD</small></span>
              <div className="price-alert-input-wrap"><span>$</span><input type="number" min="0.000000000001" step="any" inputMode="decimal" placeholder="Enter target price" value={targetPrice} onChange={(event) => setTargetPrice(event.target.value)} disabled={saving} /></div>
              <small>Up to 12 decimal places.</small>
            </label>
          </div>
          {formError && <div className="portfolio-form-error"><CircleAlert size={13} /> {formError}</div>}
          <div className="price-alert-form-footer">
            <p><Info size={13} /> If the target is already met when you create the rule, it can trigger immediately.</p>
            <button type="submit" className="portfolio-add-button" disabled={saving || !market.length}><Plus size={14} /> {saving ? 'Saving…' : 'Create alert'}</button>
          </div>
        </form>
      </section>

      <section className="market-card price-alert-list-card">
        <div className="panel-heading price-alert-list-heading">
          <div><h2>Your price alerts</h2><p>Rules are evaluated against the latest locally saved market snapshot.</p></div>
          <div className="price-alert-list-actions">
            <label className="search-box price-alert-search"><span className="sr-only">Search alerts</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search alerts…" /></label>
            <select className="price-alert-filter" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} aria-label="Filter alerts">
              <option value="all">All states</option><option value="active">Active</option><option value="triggered">Triggered</option><option value="paused">Paused</option>
            </select>
          </div>
        </div>
        <div className="table-scroll">
          <table className="price-alert-table">
            <thead><tr><th>Asset</th><th>Condition</th><th>Target price</th><th>Latest price</th><th>Status</th><th>Triggered at</th><th>Actions</th></tr></thead>
            <tbody>
              {visibleAlerts.map((alert) => (
                <tr key={alert.id}>
                  <td><div className="table-asset"><CoinAvatar image={alert.image} symbol={alert.symbol} /><div><strong>{alert.name}</strong><span>{alert.symbol.toUpperCase()}</span></div></div></td>
                  <td><span className={`price-alert-condition ${alert.condition.toLowerCase()}`}>{alert.condition === 'ABOVE' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{alert.condition === 'ABOVE' ? 'Above' : 'Below'}</span></td>
                  <td className="number-cell">{usd(alert.target_price)}</td>
                  <td className="number-cell">{usd(alert.current_price)}</td>
                  <td><StatusBadge alert={alert} snapshotFresh={snapshotFresh} /></td>
                  <td className="price-alert-date">{alert.triggered_at ? formatDate(alert.triggered_at) : '—'}{alert.triggered_price && <small>at {usd(alert.triggered_price)}</small>}</td>
                  <td><div className="portfolio-row-actions">
                    <button title={alert.status === 'active' ? 'Pause alert' : 'Re-arm alert'} aria-label={alert.status === 'active' ? 'Pause alert' : 'Re-arm alert'} disabled={saving} onClick={() => { void onUpdate(alert.id, { is_active: alert.status !== 'active' }).catch(() => undefined) }}>
                      {alert.status === 'active' ? <Pause size={13} /> : <Play size={13} />}
                    </button>
                    <button title="Delete alert" aria-label="Delete alert" disabled={saving} onClick={() => void handleDelete(alert)}><Trash2 size={13} /></button>
                  </div></td>
                </tr>
              ))}
              {!visibleAlerts.length && <tr><td colSpan={7} className="empty-table">{loading ? 'Loading price alerts…' : alerts.length ? 'No alerts match this filter.' : 'No price alerts yet. Create your first rule above.'}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="table-bottom"><span>Showing {visibleAlerts.length} of {alerts.length} alerts</span><span>{loading ? 'Refreshing…' : 'One-shot rules · USD targets'}</span></div>
      </section>

      <div className="price-alert-info-note">
        <Info size={14} />
        <div>
          <strong>How price checks work</strong>
          <span>Nova Terminal evaluates active rules using the latest MongoDB Top-100 snapshot while the app is open. CoinGecko market data refreshes on its configured interval (currently around 10 minutes). This is not tick-by-tick monitoring and alerts are not evaluated while the app/backend is stopped.</span>
          <small>{snapshotAt ? `Last market snapshot: ${formatDate(snapshotAt)}${snapshotFresh ? ' · Fresh' : ' · Stale'}` : 'No market snapshot timestamp is available yet.'}</small>
        </div>
      </div>

      {notificationPermission === 'denied' && <div className="notice warning"><Bell size={14} /> Browser notifications are blocked. Allow notifications for localhost in your browser site settings to enable them.</div>}
      {notificationPermission === 'unsupported' && <div className="notice warning"><Bell size={14} /> This browser does not support notifications. Triggered alerts will still appear in this page.</div>}
    </div>
  )
}
