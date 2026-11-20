import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  type UTCTimestamp,
} from 'lightweight-charts'
import { Maximize2, Minus, MousePointer2, Settings2, TrendingUp, Trash2, X } from 'lucide-react'
import type { Candle } from '../lib/api'
import { calculateEma, calculateMacd, calculateRsi, calculateSma } from '../lib/indicators'
import { applyPeriodDraft, DEFAULT_SETTINGS, type IndicatorSettings, type PeriodKey } from '../lib/periodSettings'

type Props = {
  data: Candle[]
  chartType: 'candles' | 'line'
  loading: boolean
  assetId?: string
}

type ToggleKey = 'emaEnabled' | 'smaEnabled' | 'rsiEnabled' | 'macdEnabled'

const SETTINGS_STORAGE_KEY = 'nova-terminal.indicators.v04'

type DrawingPoint = { time: number; price: number }
type TrendlineDrawing = { id: string; type: 'trendline'; start: DrawingPoint; end: DrawingPoint }
type HorizontalDrawing = { id: string; type: 'horizontal'; price: number }
type ChartDrawing = TrendlineDrawing | HorizontalDrawing
type DrawingTool = 'select' | 'trendline' | 'horizontal'
type CoordinatePriceSeries = {
  coordinateToPrice: (coordinate: number) => number | null
  priceToCoordinate: (price: number) => number | null
}
type DragState = { id: string; pointerStart: DrawingPoint; original: ChartDrawing }

const DRAWING_STORAGE_PREFIX = 'nova-terminal.drawings.v05.'

function drawingStorageKey(assetId: string) {
  return `${DRAWING_STORAGE_PREFIX}${encodeURIComponent(assetId)}`
}

function loadDrawings(assetId: string): ChartDrawing[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(drawingStorageKey(assetId)) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is ChartDrawing => {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string') return false
      if (item.type === 'horizontal') return Number.isFinite(item.price)
      return item.type === 'trendline'
        && item.start && item.end
        && Number.isFinite(item.start.time) && Number.isFinite(item.start.price)
        && Number.isFinite(item.end.time) && Number.isFinite(item.end.price)
    })
  } catch {
    return []
  }
}

function makeDrawingId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `drawing-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}

function loadSettings(): IndicatorSettings {
  try {
    const saved = JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? 'null') as Partial<IndicatorSettings> | null
    if (!saved || typeof saved !== 'object') return DEFAULT_SETTINGS
    const macdFast = clampInteger(Number(saved.macdFast ?? DEFAULT_SETTINGS.macdFast), 2, 100)
    return {
      emaEnabled: typeof saved.emaEnabled === 'boolean' ? saved.emaEnabled : DEFAULT_SETTINGS.emaEnabled,
      emaPeriod: clampInteger(Number(saved.emaPeriod ?? DEFAULT_SETTINGS.emaPeriod), 2, 200),
      smaEnabled: typeof saved.smaEnabled === 'boolean' ? saved.smaEnabled : DEFAULT_SETTINGS.smaEnabled,
      smaPeriod: clampInteger(Number(saved.smaPeriod ?? DEFAULT_SETTINGS.smaPeriod), 2, 200),
      rsiEnabled: typeof saved.rsiEnabled === 'boolean' ? saved.rsiEnabled : DEFAULT_SETTINGS.rsiEnabled,
      rsiPeriod: clampInteger(Number(saved.rsiPeriod ?? DEFAULT_SETTINGS.rsiPeriod), 2, 100),
      macdEnabled: typeof saved.macdEnabled === 'boolean' ? saved.macdEnabled : DEFAULT_SETTINGS.macdEnabled,
      macdFast,
      macdSlow: Math.max(clampInteger(Number(saved.macdSlow ?? DEFAULT_SETTINGS.macdSlow), 3, 200), macdFast + 1),
      macdSignal: clampInteger(Number(saved.macdSignal ?? DEFAULT_SETTINGS.macdSignal), 2, 50),
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

const formatPrice = (value: number) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: value > 0 && value < 1 ? 4 : 2,
  maximumFractionDigits: value > 0 && value < 1 ? 8 : 2,
}).format(value)

const formatVolume = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return `$${new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value)}`
}

const formatDate = (timestamp: number) => new Date(timestamp * 1000).toLocaleString('en-US', {
  month: 'short',
  day: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export default function CoinChart({ data, chartType, loading, assetId = 'bitcoin' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const drawingOverlayRef = useRef<SVGSVGElement>(null)
  const priceSeriesRef = useRef<CoordinatePriceSeries | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null)
  const preserveRangeRef = useRef(false)
  const previousRangeRef = useRef<{ from: number; to: number } | null>(null)
  const [hoveredCandle, setHoveredCandle] = useState<Candle | null>(null)
  const [settings, setSettings] = useState<IndicatorSettings>(loadSettings)
  const [periodDrafts, setPeriodDrafts] = useState<Partial<Record<PeriodKey, string>>>({})
  const [settingsStorageWarning, setSettingsStorageWarning] = useState('')
  const [drawingStorageWarning, setDrawingStorageWarning] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [drawingTool, setDrawingTool] = useState<DrawingTool>('select')
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null)
  const [pendingPoint, setPendingPoint] = useState<DrawingPoint | null>(null)
  const [previewPoint, setPreviewPoint] = useState<DrawingPoint | null>(null)
  const [drawingRevision, setDrawingRevision] = useState(0)
  const [drawingState, setDrawingState] = useState(() => ({ assetId, drawings: loadDrawings(assetId) }))
  const drawings = drawingState.assetId === assetId ? drawingState.drawings : []
  const storageWarning = [settingsStorageWarning, drawingStorageWarning].filter(Boolean).join(' ')
  const latestCandle = data.length ? data[data.length - 1] : null
  const displayedCandle = hoveredCandle ?? latestCandle
  const volumeCount = useMemo(() => data.filter((item) => typeof item.volume_24h === 'number' && Number.isFinite(item.volume_24h)).length, [data])
  const emaData = useMemo(() => calculateEma(data, settings.emaPeriod), [data, settings.emaPeriod])
  const smaData = useMemo(() => calculateSma(data, settings.smaPeriod), [data, settings.smaPeriod])
  const rsiData = useMemo(() => calculateRsi(data, settings.rsiPeriod), [data, settings.rsiPeriod])
  const macdData = useMemo(() => calculateMacd(data, settings.macdFast, settings.macdSlow, settings.macdSignal), [data, settings.macdFast, settings.macdSlow, settings.macdSignal])
  const chartHeight = 330 + (settings.rsiEnabled ? 112 : 0) + (settings.macdEnabled ? 128 : 0)

  useEffect(() => {
    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
      setSettingsStorageWarning('')
    } catch {
      setSettingsStorageWarning('Indicator preferences could not be saved to browser storage.')
    }
  }, [settings])

  useEffect(() => {
    setDrawingState({ assetId, drawings: loadDrawings(assetId) })
    setSelectedDrawingId(null)
    setPendingPoint(null)
    setPreviewPoint(null)
    setDrawingTool('select')
    dragRef.current = null
  }, [assetId])

  useEffect(() => {
    if (drawingState.assetId === assetId) {
      try {
        window.localStorage.setItem(drawingStorageKey(assetId), JSON.stringify(drawingState.drawings))
      } catch {
        setDrawingStorageWarning('Drawings could not be saved to browser storage.')
      }
    }
  }, [drawingState, assetId])

  const updateDrawings = (updater: (current: ChartDrawing[]) => ChartDrawing[]) => {
    setDrawingState((current) => current.assetId === assetId
      ? { ...current, drawings: updater(current.drawings) }
      : current)
  }

  const pointFromClient = (clientX: number, clientY: number): DrawingPoint | null => {
    const overlay = drawingOverlayRef.current
    const chart = chartRef.current
    const priceSeries = priceSeriesRef.current
    if (!overlay || !chart || !priceSeries) return null
    const rect = overlay.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    if (x < 0 || x > chart.timeScale().width() || y < 0 || y > 330) return null
    const time = chart.timeScale().coordinateToTime(x)
    const price = priceSeries.coordinateToPrice(y)
    if (typeof time !== 'number' || price === null || !Number.isFinite(price)) return null
    return { time, price }
  }

  const beginDrawingDrag = (event: ReactPointerEvent<SVGLineElement>, drawing: ChartDrawing) => {
    if (drawingTool !== 'select') return
    event.preventDefault()
    event.stopPropagation()
    const pointerStart = pointFromClient(event.clientX, event.clientY)
    if (!pointerStart) return
    setSelectedDrawingId(drawing.id)
    dragRef.current = { id: drawing.id, pointerStart, original: drawing }
    drawingOverlayRef.current?.setPointerCapture(event.pointerId)
  }

  const handleOverlayPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (drawingTool === 'select') return
    const point = pointFromClient(event.clientX, event.clientY)
    if (!point) return
    event.preventDefault()
    if (drawingTool === 'horizontal') {
      const drawing: HorizontalDrawing = { id: makeDrawingId(), type: 'horizontal', price: point.price }
      updateDrawings((current) => [...current, drawing])
      setSelectedDrawingId(drawing.id)
      return
    }
    if (!pendingPoint) {
      setPendingPoint(point)
      setPreviewPoint(point)
      return
    }
    const drawing: TrendlineDrawing = { id: makeDrawingId(), type: 'trendline', start: pendingPoint, end: point }
    updateDrawings((current) => [...current, drawing])
    setSelectedDrawingId(drawing.id)
    setPendingPoint(null)
    setPreviewPoint(null)
  }

  const handleOverlayPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const point = pointFromClient(event.clientX, event.clientY)
    if (!point) return
    const drag = dragRef.current
    if (drag) {
      const deltaTime = point.time - drag.pointerStart.time
      const deltaPrice = point.price - drag.pointerStart.price
      updateDrawings((current) => current.map((item) => {
        if (item.id !== drag.id) return item
        if (drag.original.type === 'horizontal' && item.type === 'horizontal') {
          return { ...drag.original, price: drag.original.price + deltaPrice }
        }
        if (drag.original.type === 'trendline' && item.type === 'trendline') {
          return {
            ...drag.original,
            start: { time: drag.original.start.time + deltaTime, price: drag.original.start.price + deltaPrice },
            end: { time: drag.original.end.time + deltaTime, price: drag.original.end.price + deltaPrice },
          }
        }
        return item
      }))
      return
    }
    if (drawingTool !== 'select') setPreviewPoint(point)
  }

  const finishOverlayPointer = () => {
    dragRef.current = null
    setPreviewPoint(pendingPoint)
  }

  const activateDrawingTool = (tool: DrawingTool) => {
    setDrawingTool(tool)
    setPendingPoint(null)
    setPreviewPoint(null)
    dragRef.current = null
  }

  const deleteSelectedDrawing = () => {
    if (!selectedDrawingId) return
    updateDrawings((current) => current.filter((item) => item.id !== selectedDrawingId))
    setSelectedDrawingId(null)
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedDrawingId) {
        event.preventDefault()
        updateDrawings((current) => current.filter((item) => item.id !== selectedDrawingId))
        setSelectedDrawingId(null)
      }
      if (event.key === 'Escape') {
        setPendingPoint(null)
        setPreviewPoint(null)
        setDrawingTool('select')
        dragRef.current = null
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedDrawingId, assetId])

  const toggleIndicator = (key: ToggleKey) => {
    preserveRangeRef.current = true
    setSettings((current) => ({ ...current, [key]: !current[key] }))
  }

  const updatePeriod = (key: PeriodKey, rawValue: string) => {
    // Keep the text draft separate from indicator settings. This lets the user
    // temporarily clear or replace a value without React immediately restoring
    // the previous/minimum number on every keystroke.
    setPeriodDrafts((current) => ({ ...current, [key]: rawValue }))
  }

  const commitPeriod = (key: PeriodKey) => {
    const rawValue = periodDrafts[key] ?? String(settings[key])
    const nextSettings = applyPeriodDraft(settings, key, rawValue)

    preserveRangeRef.current = true
    setSettings(nextSettings)
    setPeriodDrafts((current) => ({
      ...current,
      [key]: String(nextSettings[key]),
      ...(key === 'macdFast' || key === 'macdSlow'
        ? { macdFast: String(nextSettings.macdFast), macdSlow: String(nextSettings.macdSlow) }
        : {}),
    }))
  }

  const cancelPeriodDraft = (key: PeriodKey) => {
    setPeriodDrafts((current) => ({ ...current, [key]: String(settings[key]) }))
  }

  const periodInput = (key: PeriodKey, label: string, min: number, max: number) => (
    <input
      aria-label={label}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      spellCheck={false}
      value={periodDrafts[key] ?? String(settings[key])}
      onFocus={() => setPeriodDrafts((current) => ({ ...current, [key]: String(settings[key]) }))}
      onChange={(event) => updatePeriod(key, event.target.value)}
      onBlur={() => commitPeriod(key)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          event.preventDefault()
          cancelPeriodDraft(key)
        }
      }}
      title={`Allowed range: ${min}–${max}`}
    />
  )

  useEffect(() => {
    setHoveredCandle(null)
    const container = containerRef.current
    if (!container) return

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#0c111b' },
        textColor: '#8290a5',
        attributionLogo: true,
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
        panes: {
          separatorColor: 'rgba(136, 153, 176, 0.16)',
          separatorHoverColor: 'rgba(184, 243, 109, 0.38)',
          enableResize: true,
        },
      },
      grid: {
        vertLines: { color: 'rgba(136, 153, 176, 0.08)' },
        horzLines: { color: 'rgba(136, 153, 176, 0.08)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(136, 153, 176, 0.14)',
        scaleMargins: { top: 0.1, bottom: 0.24 },
      },
      timeScale: {
        borderColor: 'rgba(136, 153, 176, 0.14)',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
        barSpacing: 8,
        minBarSpacing: 2,
      },
      crosshair: {
        mode: CrosshairMode.MagnetOHLC,
        vertLine: { color: '#71839c', labelBackgroundColor: '#26354a', width: 1 },
        horzLine: { color: '#71839c', labelBackgroundColor: '#26354a', width: 1 },
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: true,
      },
    })

    chartRef.current = chart
    const chartData = data.map((item) => ({ ...item, time: item.time as UTCTimestamp }))
    const candleByTime = new Map<number, Candle>(data.map((item) => [item.time, item] as const))

    if (chartType === 'candles') {
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#20c997',
        downColor: '#f05d6c',
        borderVisible: false,
        wickUpColor: '#20c997',
        wickDownColor: '#f05d6c',
        priceLineVisible: true,
        lastValueVisible: true,
      })
      candleSeries.setData(chartData)
      priceSeriesRef.current = candleSeries
    } else {
      const lineSeries = chart.addSeries(LineSeries, {
        color: '#86a5ff',
        lineWidth: 2,
        crosshairMarkerRadius: 3,
        priceLineVisible: true,
        lastValueVisible: true,
      })
      lineSeries.setData(chartData.map((item) => ({ time: item.time, value: item.close })))
      priceSeriesRef.current = lineSeries
    }

    if (settings.emaEnabled && emaData.length) {
      const emaSeries = chart.addSeries(LineSeries, {
        color: '#b8f36d',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
        title: `EMA ${settings.emaPeriod}`,
      })
      emaSeries.setData(emaData.map((point) => ({ time: point.time as UTCTimestamp, value: point.value })))
    }

    if (settings.smaEnabled && smaData.length) {
      const smaSeries = chart.addSeries(LineSeries, {
        color: '#e5a65a',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
        title: `SMA ${settings.smaPeriod}`,
      })
      smaSeries.setData(smaData.map((point) => ({ time: point.time as UTCTimestamp, value: point.value })))
    }

    const volumeData = data
      .filter((item): item is Candle & { volume_24h: number } => (
        typeof item.volume_24h === 'number' && Number.isFinite(item.volume_24h) && item.volume_24h >= 0
      ))
      .map((item) => ({
        time: item.time as UTCTimestamp,
        value: item.volume_24h,
        color: item.close >= item.open ? 'rgba(32, 201, 151, 0.42)' : 'rgba(240, 93, 108, 0.42)',
      }))

    if (volumeData.length) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceScaleId: 'volume',
        priceFormat: { type: 'volume' },
        base: 0,
        lastValueVisible: false,
        priceLineVisible: false,
      })
      volumeSeries.setData(volumeData)
      chart.priceScale('volume').applyOptions({
        visible: false,
        scaleMargins: { top: 0.82, bottom: 0 },
      })
    }

    if (settings.rsiEnabled) {
      const rsiPane = chart.addPane()
      rsiPane.setHeight(112)
      const rsiSeries = chart.addSeries(LineSeries, {
        color: '#9b8cff',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
        title: `RSI ${settings.rsiPeriod}`,
      }, rsiPane.paneIndex())
      rsiSeries.setData(rsiData.map((point) => ({ time: point.time as UTCTimestamp, value: point.value })))
      ;[
        { price: 70, color: 'rgba(240, 93, 108, 0.7)', title: '70' },
        { price: 50, color: 'rgba(130, 144, 165, 0.42)', title: '50' },
        { price: 30, color: 'rgba(32, 201, 151, 0.7)', title: '30' },
      ].forEach((line) => rsiSeries.createPriceLine({
        price: line.price,
        color: line.color,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: line.title,
      }))
      chart.priceScale('right', rsiPane.paneIndex()).applyOptions({ scaleMargins: { top: 0.12, bottom: 0.12 } })
    }

    if (settings.macdEnabled) {
      const macdPane = chart.addPane()
      macdPane.setHeight(128)
      const macdIndex = macdPane.paneIndex()
      const histogramSeries = chart.addSeries(HistogramSeries, {
        base: 0,
        priceLineVisible: false,
        lastValueVisible: false,
        priceFormat: { type: 'price', precision: 8, minMove: 0.00000001 },
      }, macdIndex)
      histogramSeries.setData(macdData.histogram.map((point) => ({ time: point.time as UTCTimestamp, value: point.value, color: point.color })))

      const macdSeries = chart.addSeries(LineSeries, {
        color: '#75a7ff',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
        title: 'MACD',
        priceFormat: { type: 'price', precision: 8, minMove: 0.00000001 },
      }, macdIndex)
      macdSeries.setData(macdData.macd.map((point) => ({ time: point.time as UTCTimestamp, value: point.value })))

      const signalSeries = chart.addSeries(LineSeries, {
        color: '#e5a65a',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
        title: 'Signal',
        priceFormat: { type: 'price', precision: 8, minMove: 0.00000001 },
      }, macdIndex)
      signalSeries.setData(macdData.signal.map((point) => ({ time: point.time as UTCTimestamp, value: point.value })))
      macdSeries.createPriceLine({
        price: 0,
        color: 'rgba(130, 144, 165, 0.55)',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: false,
        title: '0',
      })
      chart.priceScale('right', macdIndex).applyOptions({ scaleMargins: { top: 0.12, bottom: 0.12 } })
    }

    chart.panes()[0]?.setHeight(330)

    const handleCrosshairMove = (param: Parameters<typeof chart.subscribeCrosshairMove>[0] extends (event: infer T) => void ? T : never) => {
      if (typeof param.time !== 'number' || !param.point || param.point.x < 0 || param.point.y < 0) {
        setHoveredCandle(null)
        return
      }
      setHoveredCandle(candleByTime.get(param.time) ?? null)
    }

    chart.subscribeCrosshairMove(handleCrosshairMove)
    const handleVisibleRangeChange = () => setDrawingRevision((revision) => revision + 1)
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleVisibleRangeChange)
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(handleVisibleRangeChange) : null
    if (resizeObserver) resizeObserver.observe(container)
    setDrawingRevision((revision) => revision + 1)
    if (preserveRangeRef.current && previousRangeRef.current) {
      chart.timeScale().setVisibleLogicalRange(previousRangeRef.current)
    } else if (chartData.length) {
      chart.timeScale().fitContent()
    }
    preserveRangeRef.current = false
    previousRangeRef.current = null

    return () => {
      if (preserveRangeRef.current) previousRangeRef.current = chart.timeScale().getVisibleLogicalRange()
      chart.unsubscribeCrosshairMove(handleCrosshairMove)
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleVisibleRangeChange)
      resizeObserver?.disconnect()
      if (chartRef.current === chart) chartRef.current = null
      priceSeriesRef.current = null
      chart.remove()
    }
  }, [data, chartType, settings, emaData, smaData, rsiData, macdData])

  const insufficientHistory = useMemo(() => {
    const messages: string[] = []
    if (settings.emaEnabled && data.length < settings.emaPeriod) messages.push(`EMA ${settings.emaPeriod} needs at least ${settings.emaPeriod} candles`)
    if (settings.smaEnabled && data.length < settings.smaPeriod) messages.push(`SMA ${settings.smaPeriod} needs at least ${settings.smaPeriod} candles`)
    if (settings.rsiEnabled && data.length <= settings.rsiPeriod) messages.push(`RSI ${settings.rsiPeriod} needs more candles`)
    if (settings.macdEnabled && data.length < settings.macdSlow + settings.macdSignal - 1) messages.push(`MACD ${settings.macdFast}/${settings.macdSlow}/${settings.macdSignal} needs more candles`)
    return messages
  }, [data.length, settings])

  const plotWidth = chartRef.current?.timeScale().width() ?? 0
  const timeToX = (time: number) => chartRef.current?.timeScale().timeToCoordinate(time as UTCTimestamp) ?? null
  const priceToY = (price: number) => priceSeriesRef.current?.priceToCoordinate(price) ?? null
  const drawingElements = drawings.map((drawing) => {
    if (drawing.type === 'horizontal') {
      const y = priceToY(drawing.price)
      if (y === null) return null
      const selected = drawing.id === selectedDrawingId
      return (
        <g key={drawing.id}>
          <line x1={0} y1={y} x2={plotWidth} y2={y} stroke="transparent" strokeWidth={12} pointerEvents={drawingTool === 'select' ? 'stroke' : 'none'} onPointerDown={(event) => beginDrawingDrag(event, drawing)} />
          <line x1={0} y1={y} x2={plotWidth} y2={y} stroke="#f2c66d" strokeWidth={selected ? 2.5 : 1.6} strokeDasharray="7 4" pointerEvents="none" />
          <rect x={plotWidth + 5} y={y - 9} width={42} height={18} rx={3} fill="#6b5326" pointerEvents="none" />
          <text x={plotWidth + 26} y={y + 3.5} textAnchor="middle" fill="#fff1ca" fontSize={9} fontWeight={700} pointerEvents="none">{formatPrice(drawing.price).replace('$', '')}</text>
        </g>
      )
    }
    const x1 = timeToX(drawing.start.time)
    const x2 = timeToX(drawing.end.time)
    const y1 = priceToY(drawing.start.price)
    const y2 = priceToY(drawing.end.price)
    if (x1 === null || x2 === null || y1 === null || y2 === null) return null
    const selected = drawing.id === selectedDrawingId
    return (
      <g key={drawing.id}>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={12} pointerEvents={drawingTool === 'select' ? 'stroke' : 'none'} onPointerDown={(event) => beginDrawingDrag(event, drawing)} />
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#75a7ff" strokeWidth={selected ? 2.8 : 1.8} pointerEvents="none" />
        {selected && <g pointerEvents="none">
          <circle cx={x1} cy={y1} r={3.5} fill="#0c111b" stroke="#a7c3ff" strokeWidth={1.5} />
          <circle cx={x2} cy={y2} r={3.5} fill="#0c111b" stroke="#a7c3ff" strokeWidth={1.5} />
        </g>}
      </g>
    )
  })
  const pendingX = pendingPoint ? timeToX(pendingPoint.time) : null
  const pendingY = pendingPoint ? priceToY(pendingPoint.price) : null
  const previewX = previewPoint ? timeToX(previewPoint.time) : null
  const previewY = previewPoint ? priceToY(previewPoint.price) : null
  void drawingRevision

  return (
    <div className="technical-chart-wrap">
      <div className="indicator-toolbar">
        <div className="indicator-toolbar-title">INDICATORS</div>
        <div className="indicator-chip-row">
          <button type="button" className={`indicator-chip ${settings.emaEnabled ? 'enabled ema' : ''}`} onClick={() => toggleIndicator('emaEnabled')} aria-pressed={settings.emaEnabled}>
            <span className="indicator-chip-dot" /> EMA <small>{settings.emaPeriod}</small>
          </button>
          <button type="button" className={`indicator-chip ${settings.smaEnabled ? 'enabled sma' : ''}`} onClick={() => toggleIndicator('smaEnabled')} aria-pressed={settings.smaEnabled}>
            <span className="indicator-chip-dot" /> SMA <small>{settings.smaPeriod}</small>
          </button>
          <button type="button" className={`indicator-chip ${settings.rsiEnabled ? 'enabled rsi' : ''}`} onClick={() => toggleIndicator('rsiEnabled')} aria-pressed={settings.rsiEnabled}>
            <span className="indicator-chip-dot" /> RSI <small>{settings.rsiPeriod}</small>
          </button>
          <button type="button" className={`indicator-chip ${settings.macdEnabled ? 'enabled macd' : ''}`} onClick={() => toggleIndicator('macdEnabled')} aria-pressed={settings.macdEnabled}>
            <span className="indicator-chip-dot" /> MACD <small>{settings.macdFast}/{settings.macdSlow}/{settings.macdSignal}</small>
          </button>
        </div>
        <button type="button" className={`indicator-settings-trigger ${settingsOpen ? 'open' : ''}`} onClick={() => setSettingsOpen((open) => !open)} aria-expanded={settingsOpen}>
          <Settings2 size={13} /> Settings
        </button>
      </div>
      <div className="indicator-series-legend">
        {settings.emaEnabled && <span><i className="series-dot ema-dot" /> EMA {settings.emaPeriod}</span>}
        {settings.smaEnabled && <span><i className="series-dot sma-dot" /> SMA {settings.smaPeriod}</span>}
        {settings.rsiEnabled && <span><i className="series-dot rsi-dot" /> RSI {settings.rsiPeriod} · levels 30 / 50 / 70</span>}
        {settings.macdEnabled && (
          <>
            <span><i className="series-dot macd-dot" /> MACD</span>
            <span><i className="series-dot signal-dot" /> Signal</span>
            <span><i className="series-dot histogram-dot" /> Histogram</span>
          </>
        )}
      </div>

      {settingsOpen && (
        <div className="indicator-settings-panel">
          <div className="indicator-settings-heading">
            <div><strong>Indicator settings</strong><span>Toggle indicators and adjust their calculation periods.</span></div>
            <button type="button" onClick={() => setSettingsOpen(false)} aria-label="Close indicator settings"><X size={15} /></button>
          </div>
          <div className="indicator-settings-grid">
            <div className="indicator-setting-card">
              <label className="indicator-setting-name"><input type="checkbox" checked={settings.emaEnabled} onChange={() => toggleIndicator('emaEnabled')} /> EMA</label>
              <label className="indicator-setting-field">Period{periodInput('emaPeriod', 'EMA period', 2, 200)}</label>
            </div>
            <div className="indicator-setting-card">
              <label className="indicator-setting-name"><input type="checkbox" checked={settings.smaEnabled} onChange={() => toggleIndicator('smaEnabled')} /> SMA</label>
              <label className="indicator-setting-field">Period{periodInput('smaPeriod', 'SMA period', 2, 200)}</label>
            </div>
            <div className="indicator-setting-card">
              <label className="indicator-setting-name"><input type="checkbox" checked={settings.rsiEnabled} onChange={() => toggleIndicator('rsiEnabled')} /> RSI</label>
              <label className="indicator-setting-field">Period{periodInput('rsiPeriod', 'RSI period', 2, 100)}</label>
            </div>
            <div className="indicator-setting-card macd-setting-card">
              <label className="indicator-setting-name"><input type="checkbox" aria-label="Enable MACD" checked={settings.macdEnabled} onChange={() => toggleIndicator('macdEnabled')} /> MACD</label>
              <div className="macd-period-fields">
                <label>Fast{periodInput('macdFast', 'MACD fast period', 2, 100)}</label>
                <label>Slow{periodInput('macdSlow', 'MACD slow period', 3, 200)}</label>
                <label>Signal{periodInput('macdSignal', 'MACD signal period', 2, 50)}</label>
              </div>
            </div>
          </div>
          <p className="indicator-settings-note">Periods are applied when you finish editing. Valid ranges: EMA/SMA 2–200, RSI 2–100, MACD fast 2–100, slow 3–200 (must exceed fast), signal 2–50.</p>
          <p className="indicator-settings-note">Indicators are calculated in your browser from the loaded CoinGecko OHLC close prices. Settings are saved locally on this device.</p>
        </div>
      )}

      {storageWarning && <div className="chart-storage-warning" role="status">{storageWarning}</div>}
      <div className="drawing-toolbar" aria-label="Chart drawing tools">
        <span className="drawing-toolbar-label">DRAW</span>
        <button type="button" className={`drawing-tool-button ${drawingTool === 'select' ? 'active' : ''}`} onClick={() => activateDrawingTool('select')} aria-pressed={drawingTool === 'select'} title="Select and move drawings">
          <MousePointer2 size={13} /> Select
        </button>
        <button type="button" className={`drawing-tool-button ${drawingTool === 'trendline' ? 'active' : ''}`} onClick={() => activateDrawingTool('trendline')} aria-pressed={drawingTool === 'trendline'} title="Draw a trendline using two points">
          <TrendingUp size={13} /> Trendline
        </button>
        <button type="button" className={`drawing-tool-button ${drawingTool === 'horizontal' ? 'active' : ''}`} onClick={() => activateDrawingTool('horizontal')} aria-pressed={drawingTool === 'horizontal'} title="Draw a horizontal price level">
          <Minus size={13} /> Horizontal
        </button>
        <button type="button" className="drawing-tool-button drawing-delete-button" onClick={deleteSelectedDrawing} disabled={!selectedDrawingId} title="Delete selected drawing (Delete key)">
          <Trash2 size={13} /> Delete
        </button>
        <span className="drawing-tool-status">{drawingTool === 'trendline' ? (pendingPoint ? 'Click a second point · Esc to cancel' : 'Click two points to draw') : drawingTool === 'horizontal' ? 'Click chart to add a price level' : `${drawings.length} drawing${drawings.length === 1 ? '' : 's'}`}</span>
      </div>
      <div className="chart-shell" style={{ height: `${chartHeight}px` }}>
        <div ref={containerRef} className="chart-canvas" />
        <svg
          ref={drawingOverlayRef}
          className={`drawing-overlay ${drawingTool !== 'select' ? 'draw-active' : ''}`}
          width="100%"
          height="330"
          onPointerDown={handleOverlayPointerDown}
          onPointerMove={handleOverlayPointerMove}
          onPointerUp={finishOverlayPointer}
          onPointerCancel={finishOverlayPointer}
          aria-label="Chart drawing layer"
        >
          {drawingElements}
          {drawingTool === 'horizontal' && previewY !== null && (
            <line x1={0} y1={previewY} x2={plotWidth} y2={previewY} stroke="#f2c66d" strokeWidth={1.2} strokeDasharray="4 4" opacity={0.75} pointerEvents="none" />
          )}
          {drawingTool === 'trendline' && pendingX !== null && pendingY !== null && previewX !== null && previewY !== null && (
            <line x1={pendingX} y1={pendingY} x2={previewX} y2={previewY} stroke="#75a7ff" strokeWidth={1.5} strokeDasharray="5 4" opacity={0.85} pointerEvents="none" />
          )}
        </svg>
        {displayedCandle && (
          <div className="chart-ohlc-legend" aria-live="polite" aria-label={`OHLC and 24-hour volume data; ${volumeCount} volume observations`}>
            <span className="chart-legend-time">{formatDate(displayedCandle.time)}</span>
            <span><b>O</b> {formatPrice(displayedCandle.open)}</span>
            <span><b>H</b> {formatPrice(displayedCandle.high)}</span>
            <span><b>L</b> {formatPrice(displayedCandle.low)}</span>
            <span><b>C</b> {formatPrice(displayedCandle.close)}</span>
            <span className="chart-legend-volume"><b>24H VOL</b> {formatVolume(displayedCandle.volume_24h)}</span>
          </div>
        )}
        <div className="chart-interaction-hint">Scroll to zoom · Drag to pan</div>
        <button
          type="button"
          className="chart-reset-view"
          onClick={() => chartRef.current?.timeScale().fitContent()}
          aria-label="Reset chart view"
          title="Reset chart view"
        >
          <Maximize2 size={13} />
        </button>
        {!loading && data.length === 0 && (
          <div className="chart-empty">
            <div className="chart-empty-icon">◫</div>
            <p>No chart data available</p>
            <span>Check your CoinGecko Demo API key and API quota.</span>
          </div>
        )}
        {loading && (
          <div className="chart-loading"><span className="loader" /> Loading market history…</div>
        )}
      </div>
      {insufficientHistory.length > 0 && (
        <div className="indicator-history-warning">{insufficientHistory.join(' · ')}. Choose a longer chart timeframe.</div>
      )}
    </div>
  )
}
