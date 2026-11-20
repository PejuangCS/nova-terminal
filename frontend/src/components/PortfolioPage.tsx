import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  Activity, ArrowDownRight, ArrowUpRight, ArrowUpDown, BriefcaseBusiness,
  ChartPie, CircleAlert, Edit3, Plus, RefreshCw, Search,
  Trash2, TrendingDown, TrendingUp, Wallet, X,
} from 'lucide-react'
import {
  createPortfolioTransaction, deletePortfolioTransaction, fetchPortfolio,
  updatePortfolioTransaction,
  type Coin, type PortfolioPayload,
  type PortfolioTransaction, type PortfolioTransactionInput,
} from '../lib/api'

type Props = {
  market: Coin[]
  onSelectCoin: (coinId: string) => void
  onRefreshMarket: () => Promise<void>
}

type Draft = {
  coin_id: string
  type: 'BUY' | 'SELL'
  quantity: string
  price: string
  fee: string
  executed_at: string
  notes: string
}

type AssetOption = { id: string; name: string; symbol: string; image: string; current_price: number | null }

const numberValue = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === '') return null
  const result = Number(value)
  return Number.isFinite(result) ? result : null
}

const usd = (value: string | number | null | undefined, compact = false) => {
  const parsed = numberValue(value)
  if (parsed === null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: compact ? 2 : parsed >= 1 ? 2 : 8,
  }).format(parsed)
}

const quantityFormat = (value: string | number | null | undefined) => {
  const parsed = numberValue(value)
  if (parsed === null) return '—'
  return new Intl.NumberFormat('en-US', { maximumSignificantDigits: 12 }).format(parsed)
}

const percentage = (value: string | number | null | undefined) => {
  const parsed = numberValue(value)
  if (parsed === null) return '—'
  return `${parsed > 0 ? '+' : ''}${parsed.toFixed(2)}%`
}

const localDateTimeValue = (date = new Date()) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

const toLocalDateTime = (iso: string) => {
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime()) ? localDateTimeValue() : localDateTimeValue(parsed)
}

const displayDate = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-US', {
    month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

const emptyDraft = (coinId = '', price = ''): Draft => ({
  coin_id: coinId,
  type: 'BUY',
  quantity: '',
  price,
  fee: '0',
  executed_at: localDateTimeValue(),
  notes: '',
})

function CoinAvatar({ image, symbol }: { image: string; symbol: string }) {
  return image
    ? <img className="coin-avatar" src={image} alt="" loading="lazy" />
    : <div className="coin-avatar fallback">{symbol.slice(0, 1).toUpperCase()}</div>
}

function Pnl({ value, className = '' }: { value: string | number | null | undefined; className?: string }) {
  const parsed = numberValue(value)
  if (parsed === null) return <span className="muted">—</span>
  return <span className={`portfolio-pnl ${parsed >= 0 ? 'positive' : 'negative'} ${className}`}>
    {parsed >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
    {usd(Math.abs(parsed))}
  </span>
}

function StatCard({ label, value, foot, tone, icon }: {
  label: string; value: string; foot: string; tone?: 'positive' | 'negative'; icon: ReactNode
}) {
  return <div className="portfolio-stat-card">
    <div className="portfolio-stat-top"><span>{label}</span><span className={`portfolio-stat-icon ${tone ?? ''}`}>{icon}</span></div>
    <strong className={tone === 'positive' ? 'positive-text' : tone === 'negative' ? 'negative-text' : ''}>{value}</strong>
    <small>{foot}</small>
  </div>
}

export default function PortfolioPage({ market, onSelectCoin, onRefreshMarket }: Props) {
  const [portfolio, setPortfolio] = useState<PortfolioPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'value' | 'pnl' | 'name'>('value')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const [formError, setFormError] = useState('')

  const loadPortfolio = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true)
    try {
      const result = await fetchPortfolio()
      setPortfolio(result)
      setError('')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load portfolio data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadPortfolio(true) }, [loadPortfolio])

  const assetOptions = useMemo<AssetOption[]>(() => {
    const map = new Map<string, AssetOption>()
    market.forEach((coin) => map.set(coin.id, {
      id: coin.id, name: coin.name, symbol: coin.symbol, image: coin.image, current_price: coin.current_price,
    }))
    portfolio?.holdings.forEach((holding) => {
      if (!map.has(holding.coin_id)) map.set(holding.coin_id, {
        id: holding.coin_id, name: holding.name, symbol: holding.symbol, image: holding.image,
        current_price: numberValue(holding.current_price),
      })
    })
    portfolio?.transactions.forEach((transaction) => {
      if (!map.has(transaction.coin_id)) map.set(transaction.coin_id, {
        id: transaction.coin_id, name: transaction.name, symbol: transaction.symbol, image: transaction.image,
        current_price: null,
      })
    })
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [market, portfolio])

  const selectedAsset = assetOptions.find((asset) => asset.id === draft.coin_id)

  const holdings = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const rows = (portfolio?.holdings ?? []).filter((holding) => (
      !normalized || [holding.name, holding.symbol, holding.coin_id].some((value) => value.toLowerCase().includes(normalized))
    ))
    return rows.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name)
      if (sort === 'pnl') return (numberValue(b.unrealized_pnl) ?? -Infinity) - (numberValue(a.unrealized_pnl) ?? -Infinity)
      return (numberValue(b.market_value) ?? -Infinity) - (numberValue(a.market_value) ?? -Infinity)
    })
  }, [portfolio, query, sort])

  const openCreate = () => {
    const first = market.find((coin) => coin.id === 'bitcoin') ?? market[0]
    setEditingId(null)
    setDraft(emptyDraft(first?.id ?? '', first?.current_price ? String(first.current_price) : ''))
    setFormError('')
    setModalOpen(true)
  }

  const openEdit = (transaction: PortfolioTransaction) => {
    setEditingId(transaction.id)
    setDraft({
      coin_id: transaction.coin_id,
      type: transaction.type,
      quantity: transaction.quantity,
      price: transaction.price,
      fee: transaction.fee,
      executed_at: toLocalDateTime(transaction.executed_at),
      notes: transaction.notes,
    })
    setFormError('')
    setModalOpen(true)
  }

  const updateDraft = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const handleAssetChange = (coinId: string) => {
    const asset = assetOptions.find((item) => item.id === coinId)
    setDraft((current) => ({
      ...current,
      coin_id: coinId,
      price: asset?.current_price !== null && asset?.current_price !== undefined ? String(asset.current_price) : '',
    }))
  }

  const submitTransaction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const asset = assetOptions.find((item) => item.id === draft.coin_id)
    if (!asset) {
      setFormError('Pilih aset yang valid terlebih dahulu.')
      return
    }
    if (!draft.quantity || !draft.price || !draft.executed_at) {
      setFormError('Quantity, price, dan tanggal transaksi wajib diisi.')
      return
    }
    const input: PortfolioTransactionInput = {
      coin_id: asset.id,
      name: asset.name,
      symbol: asset.symbol,
      image: asset.image,
      type: draft.type,
      quantity: draft.quantity,
      price: draft.price,
      fee: draft.fee || '0',
      currency: 'USD',
      executed_at: draft.executed_at,
      notes: draft.notes,
    }
    setSaving(true)
    setFormError('')
    try {
      const result = editingId
        ? await updatePortfolioTransaction(editingId, input)
        : await createPortfolioTransaction(input)
      setPortfolio(result)
      setModalOpen(false)
      setEditingId(null)
      setError('')
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : 'Unable to save transaction.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (transaction: PortfolioTransaction) => {
    const confirmed = window.confirm(`Hapus transaksi ${transaction.type} ${quantityFormat(transaction.quantity)} ${transaction.symbol.toUpperCase()}? Holdings dan P/L akan dihitung ulang.`)
    if (!confirmed) return
    setSaving(true)
    setError('')
    try {
      setPortfolio(await deletePortfolioTransaction(transaction.id))
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete transaction.')
    } finally {
      setSaving(false)
    }
  }

  const summary = portfolio?.summary
  const totalPnl = numberValue(summary?.total_pnl) ?? 0
  const totalPricedAllocation = portfolio?.holdings.reduce((total, holding) => total + (numberValue(holding.market_value) ?? 0), 0) ?? 0
  const allocationRows = [...(portfolio?.holdings ?? [])]
    .filter((holding) => numberValue(holding.market_value) !== null)
    .sort((a, b) => (numberValue(b.market_value) ?? 0) - (numberValue(a.market_value) ?? 0))
    .slice(0, 5)
  return (
    <>
      <div className="page-heading portfolio-page-heading">
        <div>
          <div className="eyebrow">PERSONAL PERFORMANCE <span className="eyebrow-line" /></div>
          <h1>Portfolio tracker<span className="heading-period">.</span></h1>
          <p className="page-subtitle">Track your crypto positions, transaction history, and profit or loss.</p>
        </div>
        <div className="portfolio-heading-actions">
          <button className="refresh-button secondary-refresh" onClick={() => { void (async () => { await onRefreshMarket(); await loadPortfolio(true) })() }} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin-icon' : ''} /> Refresh
          </button>
          <button className="portfolio-add-button" onClick={openCreate}><Plus size={15} /> Add transaction</button>
        </div>
      </div>

      {error && <div className="notice error"><CircleAlert size={14} /> {error}</div>}
      {portfolio?.summary.unpriced_holdings ? (
        <div className="notice warning"><CircleAlert size={14} /> {portfolio.summary.unpriced_holdings} holding(s) are outside the latest Top-100 snapshot. Their current value and unrealized P/L are excluded from totals until market data is available.</div>
      ) : null}

      <section className="portfolio-stats-grid">
        <StatCard label="Current value" value={loading && !portfolio ? '—' : usd(summary?.current_value)} foot="Latest available market snapshot" icon={<Wallet size={15} />} />
        <StatCard label="Open cost basis" value={usd(summary?.cost_basis)} foot="Remaining acquisition cost, including buy fees" icon={<BriefcaseBusiness size={15} />} />
        <StatCard label="Unrealized P/L" value={usd(summary?.unrealized_pnl)} foot="Current value minus open cost basis" tone={numberValue(summary?.unrealized_pnl) === null ? undefined : (numberValue(summary?.unrealized_pnl) ?? 0) >= 0 ? 'positive' : 'negative'} icon={<Activity size={15} />} />
        <StatCard label="Realized P/L" value={usd(summary?.realized_pnl)} foot="Closed positions, after sell fees" tone={numberValue(summary?.realized_pnl) === null ? undefined : (numberValue(summary?.realized_pnl) ?? 0) >= 0 ? 'positive' : 'negative'} icon={<ChartPie size={15} />} />
        <StatCard label="Total P/L" value={usd(summary?.total_pnl)} foot="Realized plus priced open-position P/L" tone={totalPnl >= 0 ? 'positive' : 'negative'} icon={totalPnl >= 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />} />
      </section>

      <section className="portfolio-main-grid">
        <div className="market-card portfolio-holdings-card">
          <div className="panel-heading portfolio-panel-heading">
            <div><h2>Asset holdings</h2><p>Open positions calculated with weighted-average cost.</p></div>
            <div className="portfolio-table-actions">
              <label className="search-box portfolio-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search holdings..." /></label>
              <label className="sort-control"><ArrowUpDown size={12} /><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label="Sort holdings"><option value="value">Value</option><option value="pnl">P/L</option><option value="name">Name</option></select></label>
            </div>
          </div>
          <div className="table-scroll">
            <table className="portfolio-table">
              <thead><tr><th className="asset-col">Asset</th><th>Quantity</th><th>Avg. cost</th><th>Market price</th><th>Current value</th><th>Unrealized P/L</th><th>Allocation</th><th>Chart</th></tr></thead>
              <tbody>
                {loading && !portfolio && Array.from({ length: 3 }).map((_, index) => <tr key={index}><td colSpan={8}><div className="table-skeleton" /></td></tr>)}
                {holdings.map((holding) => <tr key={holding.coin_id}>
                  <td><div className="table-asset"><CoinAvatar image={holding.image} symbol={holding.symbol} /><div><strong>{holding.name}</strong><span>{holding.symbol.toUpperCase()}</span></div></div></td>
                  <td className="number-cell">{quantityFormat(holding.quantity)}</td>
                  <td className="number-cell">{usd(holding.average_buy_price)}</td>
                  <td className="number-cell">{usd(holding.current_price)}</td>
                  <td className="number-cell">{usd(holding.market_value)}</td>
                  <td><Pnl value={holding.unrealized_pnl} /></td>
                  <td><div className="portfolio-allocation"><span>{percentage(holding.allocation_percentage)}</span><div><i style={{ width: `${Math.max(0, Math.min(100, numberValue(holding.allocation_percentage) ?? 0))}%` }} /></div></div></td>
                  <td><button className="portfolio-chart-button" onClick={() => onSelectCoin(holding.coin_id)}>View</button></td>
                </tr>)}
                {!loading && holdings.length === 0 && <tr><td colSpan={8} className="empty-table">{query ? 'No holdings match your search.' : 'No open positions yet. Add your first BUY transaction to get started.'}</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="table-bottom"><span>{summary?.holdings_count ?? 0} open positions</span><span>Current market value: {usd(summary?.current_value)}</span></div>
        </div>

        <aside className="market-card portfolio-allocation-card">
          <div className="panel-heading"><div><h2>Asset allocation</h2><p>Share of priced open positions.</p></div></div>
          {allocationRows.length ? <div className="portfolio-allocation-list">
            {allocationRows.map((holding) => {
              const share = numberValue(holding.allocation_percentage) ?? 0
              return <div className="portfolio-allocation-row" key={holding.coin_id}>
                <div className="portfolio-allocation-label"><CoinAvatar image={holding.image} symbol={holding.symbol} /><span>{holding.symbol.toUpperCase()}</span><strong>{share.toFixed(1)}%</strong></div>
                <div className="portfolio-allocation-track"><i style={{ width: `${Math.max(0, Math.min(100, share))}%` }} /></div>
              </div>
            })}
            {portfolio && portfolio.holdings.length > 5 && <small className="portfolio-allocation-foot">Top 5 of {portfolio.holdings.length} positions · {usd(totalPricedAllocation, true)} priced value</small>}
          </div> : <div className="portfolio-allocation-empty"><ChartPie size={24} /><strong>No allocation yet</strong><span>Add a transaction to see your portfolio distribution.</span></div>}
        </aside>
      </section>

      <section className="market-card portfolio-transactions-card">
        <div className="panel-heading portfolio-panel-heading">
          <div><h2>Transaction history</h2><p>Manual transaction ledger · USD · weighted-average cost method.</p></div>
          <span className="portfolio-history-count">{summary?.transactions_count ?? 0} TRANSACTIONS</span>
        </div>
        <div className="table-scroll">
          <table className="portfolio-history-table">
            <thead><tr><th>Type</th><th className="asset-col">Asset</th><th>Date</th><th>Quantity</th><th>Unit price</th><th>Fee</th><th>Cash total</th><th>Realized P/L</th><th>Actions</th></tr></thead>
            <tbody>
              {portfolio?.transactions.map((transaction) => <tr key={transaction.id}>
                <td><span className={`portfolio-type-badge ${transaction.type.toLowerCase()}`}>{transaction.type}</span></td>
                <td><div className="table-asset"><CoinAvatar image={transaction.image} symbol={transaction.symbol} /><div><strong>{transaction.name}</strong><span>{transaction.symbol.toUpperCase()}</span></div></div></td>
                <td className="portfolio-date-cell">{displayDate(transaction.executed_at)}</td>
                <td className="number-cell">{quantityFormat(transaction.quantity)}</td>
                <td className="number-cell">{usd(transaction.price)}</td>
                <td className="number-cell">{usd(transaction.fee)}</td>
                <td className="number-cell">{usd(transaction.cash_total)}</td>
                <td><Pnl value={transaction.realized_pnl} /></td>
                <td><div className="portfolio-row-actions"><button onClick={() => openEdit(transaction)} title="Edit transaction" aria-label="Edit transaction"><Edit3 size={13} /></button><button onClick={() => void handleDelete(transaction)} title="Delete transaction" aria-label="Delete transaction" disabled={saving}><Trash2 size={13} /></button></div></td>
              </tr>)}
              {!loading && (portfolio?.transactions.length ?? 0) === 0 && <tr><td colSpan={9} className="empty-table">No transactions recorded yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="table-bottom"><span>All transaction history is stored in MongoDB.</span><span>Total fees: {usd(summary?.total_fees)}</span></div>
      </section>

      <div className="portfolio-info-note"><CircleAlert size={14} /><span>{portfolio?.market_snapshot_note ?? 'Market values use the most recent available local market snapshot.'} This tracker is a manual record, not an exchange or wallet connection.</span></div>
      <footer className="page-footer"><span>© 2026 Nova Terminal · Personal project</span><span>Portfolio accounting · USD <span className="footer-separator">·</span> Not financial advice</span></footer>

      {modalOpen && <div className="portfolio-modal-backdrop">
        <section className="portfolio-modal" role="dialog" aria-modal="true" aria-labelledby="portfolio-modal-title">
          <div className="portfolio-modal-heading">
            <div><div className="eyebrow">PORTFOLIO LEDGER</div><h2 id="portfolio-modal-title">{editingId ? 'Edit transaction' : 'Add transaction'}</h2><p>Record a manual BUY or SELL transaction in USD.</p></div>
            <button className="icon-button" onClick={() => setModalOpen(false)} aria-label="Close transaction form"><X size={17} /></button>
          </div>
          <form onSubmit={(event) => void submitTransaction(event)}>
            <div className="portfolio-type-switch" role="group" aria-label="Transaction type">
              <button type="button" className={draft.type === 'BUY' ? 'selected buy' : ''} onClick={() => updateDraft('type', 'BUY')}><ArrowDownRight size={14} /> BUY</button>
              <button type="button" className={draft.type === 'SELL' ? 'selected sell' : ''} onClick={() => updateDraft('type', 'SELL')}><ArrowUpRight size={14} /> SELL</button>
            </div>
            <label className="portfolio-form-field"><span>Asset</span><select required value={draft.coin_id} onChange={(event) => handleAssetChange(event.target.value)}><option value="" disabled>Select cryptocurrency</option>{assetOptions.map((asset) => <option key={asset.id} value={asset.id}>{asset.name} ({asset.symbol.toUpperCase()})</option>)}</select></label>
            <div className="portfolio-form-grid">
              <label className="portfolio-form-field"><span>Quantity</span><input required type="number" min="0.000000000001" step="any" value={draft.quantity} onChange={(event) => updateDraft('quantity', event.target.value)} placeholder="e.g. 0.025" /></label>
              <label className="portfolio-form-field"><span>Unit price (USD)</span><input required type="number" min="0.000000000001" step="any" value={draft.price} onChange={(event) => updateDraft('price', event.target.value)} placeholder="e.g. 65000" /></label>
              <label className="portfolio-form-field"><span>Fee (USD)</span><input type="number" min="0" step="any" value={draft.fee} onChange={(event) => updateDraft('fee', event.target.value)} placeholder="0" /></label>
              <label className="portfolio-form-field"><span>Date and time</span><input required type="datetime-local" value={draft.executed_at} onChange={(event) => updateDraft('executed_at', event.target.value)} /></label>
            </div>
            <label className="portfolio-form-field"><span>Notes <small>Optional</small></span><textarea value={draft.notes} maxLength={300} onChange={(event) => updateDraft('notes', event.target.value)} placeholder="Exchange, wallet, or transaction note..." rows={2} /></label>
            {selectedAsset?.current_price !== null && selectedAsset?.current_price !== undefined && <div className="portfolio-current-price-hint">Latest market price: {usd(selectedAsset.current_price)}</div>}
            {formError && <div className="portfolio-form-error"><CircleAlert size={14} /> {formError}</div>}
            <div className="portfolio-modal-actions"><button type="button" className="portfolio-cancel-button" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</button><button type="submit" className="portfolio-add-button" disabled={saving || !assetOptions.length}>{saving ? 'Saving...' : editingId ? 'Save changes' : 'Add transaction'}</button></div>
          </form>
        </section>
      </div>}
    </>
  )
}
