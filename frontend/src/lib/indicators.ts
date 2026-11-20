import type { Candle } from './api'

export type IndicatorPoint = { time: number; value: number }
export type MacdHistogramPoint = { time: number; value: number; color: string }

export function calculateEma(data: Candle[], period: number): IndicatorPoint[] {
  if (data.length < period || period < 2) return []
  const multiplier = 2 / (period + 1)
  let previous = data.slice(0, period).reduce((sum, candle) => sum + candle.close, 0) / period
  const points: IndicatorPoint[] = [{ time: data[period - 1].time, value: previous }]

  for (let index = period; index < data.length; index += 1) {
    previous = (data[index].close * multiplier) + (previous * (1 - multiplier))
    points.push({ time: data[index].time, value: previous })
  }
  return points
}

export function calculateSma(data: Candle[], period: number): IndicatorPoint[] {
  if (data.length < period || period < 2) return []
  const points: IndicatorPoint[] = []
  let rollingTotal = 0

  for (let index = 0; index < data.length; index += 1) {
    rollingTotal += data[index].close
    if (index >= period) rollingTotal -= data[index - period].close
    if (index >= period - 1) {
      points.push({ time: data[index].time, value: rollingTotal / period })
    }
  }
  return points
}

export function calculateRsi(data: Candle[], period: number): IndicatorPoint[] {
  if (data.length <= period || period < 2) return []

  let averageGain = 0
  let averageLoss = 0
  for (let index = 1; index <= period; index += 1) {
    const change = data[index].close - data[index - 1].close
    averageGain += Math.max(change, 0)
    averageLoss += Math.max(-change, 0)
  }
  averageGain /= period
  averageLoss /= period

  const toRsi = (gain: number, loss: number) => {
    if (gain === 0 && loss === 0) return 50
    if (loss === 0) return 100
    if (gain === 0) return 0
    const relativeStrength = gain / loss
    return 100 - (100 / (1 + relativeStrength))
  }

  const points: IndicatorPoint[] = [{ time: data[period].time, value: toRsi(averageGain, averageLoss) }]
  for (let index = period + 1; index < data.length; index += 1) {
    const change = data[index].close - data[index - 1].close
    const gain = Math.max(change, 0)
    const loss = Math.max(-change, 0)
    averageGain = ((averageGain * (period - 1)) + gain) / period
    averageLoss = ((averageLoss * (period - 1)) + loss) / period
    points.push({ time: data[index].time, value: toRsi(averageGain, averageLoss) })
  }
  return points
}

function emaValues(values: number[], period: number): Array<number | null> {
  const output: Array<number | null> = Array.from({ length: values.length }, () => null)
  if (values.length < period || period < 2) return output

  const multiplier = 2 / (period + 1)
  let previous = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period
  output[period - 1] = previous
  for (let index = period; index < values.length; index += 1) {
    previous = (values[index] * multiplier) + (previous * (1 - multiplier))
    output[index] = previous
  }
  return output
}

export function calculateMacd(data: Candle[], fastPeriod: number, slowPeriod: number, signalPeriod: number) {
  if (data.length < slowPeriod + signalPeriod - 1) {
    return { macd: [] as IndicatorPoint[], signal: [] as IndicatorPoint[], histogram: [] as MacdHistogramPoint[] }
  }

  const closes = data.map((candle) => candle.close)
  const fastValues = emaValues(closes, fastPeriod)
  const slowValues = emaValues(closes, slowPeriod)
  const rawMacd = closes.map((_, index) => {
    const fast = fastValues[index]
    const slow = slowValues[index]
    return fast === null || slow === null ? null : fast - slow
  })
  const firstValidIndex = rawMacd.findIndex((value) => value !== null)
  if (firstValidIndex < 0) {
    return { macd: [] as IndicatorPoint[], signal: [] as IndicatorPoint[], histogram: [] as MacdHistogramPoint[] }
  }

  const validMacd = rawMacd.slice(firstValidIndex) as number[]
  const signalValues = emaValues(validMacd, signalPeriod)
  const macd: IndicatorPoint[] = []
  const signal: IndicatorPoint[] = []
  const histogram: MacdHistogramPoint[] = []

  for (let offset = 0; offset < validMacd.length; offset += 1) {
    const index = firstValidIndex + offset
    const macdValue = validMacd[offset]
    macd.push({ time: data[index].time, value: macdValue })
    const signalValue = signalValues[offset]
    if (signalValue === null) continue
    signal.push({ time: data[index].time, value: signalValue })
    const histogramValue = macdValue - signalValue
    histogram.push({
      time: data[index].time,
      value: histogramValue,
      color: histogramValue >= 0 ? 'rgba(32, 201, 151, 0.58)' : 'rgba(240, 93, 108, 0.58)',
    })
  }

  return { macd, signal, histogram }
}

