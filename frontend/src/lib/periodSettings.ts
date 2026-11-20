export type IndicatorSettings = {
  emaEnabled: boolean
  emaPeriod: number
  smaEnabled: boolean
  smaPeriod: number
  rsiEnabled: boolean
  rsiPeriod: number
  macdEnabled: boolean
  macdFast: number
  macdSlow: number
  macdSignal: number
}

export type PeriodKey = 'emaPeriod' | 'smaPeriod' | 'rsiPeriod' | 'macdFast' | 'macdSlow' | 'macdSignal'

export const DEFAULT_SETTINGS: IndicatorSettings = {
  emaEnabled: true,
  emaPeriod: 20,
  smaEnabled: false,
  smaPeriod: 50,
  rsiEnabled: false,
  rsiPeriod: 14,
  macdEnabled: false,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
}

const RANGES: Record<PeriodKey, { min: number; max: number }> = {
  emaPeriod: { min: 2, max: 200 },
  smaPeriod: { min: 2, max: 200 },
  rsiPeriod: { min: 2, max: 100 },
  macdFast: { min: 2, max: 100 },
  macdSlow: { min: 3, max: 200 },
  macdSignal: { min: 2, max: 50 },
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}

/**
 * Commit a period input only after editing is complete.
 * Blank/non-integer drafts revert to the previous valid setting.
 */
export function applyPeriodDraft(
  current: IndicatorSettings,
  key: PeriodKey,
  rawValue: string,
): IndicatorSettings {
  const trimmed = rawValue.trim()
  const parsed = /^\d+$/.test(trimmed) ? Number(trimmed) : current[key]
  const { min, max } = RANGES[key]
  const normalized = clampInteger(parsed, min, max)

  switch (key) {
    case 'emaPeriod':
    case 'smaPeriod':
    case 'rsiPeriod':
    case 'macdSignal':
      return { ...current, [key]: normalized }
    case 'macdFast': {
      const macdFast = normalized
      return { ...current, macdFast, macdSlow: Math.max(current.macdSlow, macdFast + 1) }
    }
    case 'macdSlow':
      return { ...current, macdSlow: Math.max(normalized, current.macdFast + 1) }
  }
}
