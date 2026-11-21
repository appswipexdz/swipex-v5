import { describe, expect, it } from 'vitest'
import {
  compareFieldVersions,
  EMPTY_PARCEL_FORM,
  normalizeTracking,
  parcelDocumentId,
  validateParcelForm,
  validateParcelPatch,
} from './parcelModel'

describe('parcel identity and validation', () => {
  it('normalizes tracking IDs consistently for document identity', () => {
    expect(normalizeTracking(' yal-12ab34 ')).toBe('YAL-12AB34')
    expect(parcelDocumentId(' yal/12 ')).toBe('YAL%2F12')
  })

  it('requires a valid tracking number and known status', () => {
    expect(() =>
      validateParcelForm({ ...EMPTY_PARCEL_FORM, tracking: '  ' }),
    ).toThrow('رقم التتبع مطلوب.')
    expect(() =>
      validateParcelForm({
        ...EMPTY_PARCEL_FORM,
        tracking: 'yal-1',
        status: 'unknown' as never,
      }),
    ).toThrow('حالة الطرد غير صالحة.')
  })

  it('trims user-entered values and caps tracking length', () => {
    expect(
      validateParcelForm({
        ...EMPTY_PARCEL_FORM,
        tracking: ' yal-123 ',
        receiver: '  Ahmed  ',
      }),
    ).toMatchObject({ tracking: 'YAL-123', receiver: 'Ahmed' })

    expect(() =>
      validateParcelForm({
        ...EMPTY_PARCEL_FORM,
        tracking: 'x'.repeat(121),
      }),
    ).toThrow('رقم التتبع يجب ألا يتجاوز 120 حرفًا.')
  })

  it('only accepts known editable fields and string values', () => {
    expect(() => validateParcelPatch({ status: 'unknown' as never })).toThrow(
      'حالة الطرد غير صالحة.',
    )
    expect(() =>
      validateParcelPatch({ tracking: 'different' } as never),
    ).toThrow('الحقل «tracking» غير قابل للتعديل.')
    expect(validateParcelPatch({ receiver: 'New name' })).toEqual({
      receiver: 'New name',
    })
  })
})

describe('per-field conflict ordering', () => {
  const version = (updatedAt: string, deviceId: string, operationId: string) => ({
    updatedAt,
    deviceId,
    operationId,
  })

  it('orders by edit time, then stable device and operation IDs', () => {
    expect(
      compareFieldVersions(
        version('2026-11-17T10:00:01.000Z', 'a', 'a'),
        version('2026-11-17T10:00:00.000Z', 'z', 'z'),
      ),
    ).toBeGreaterThan(0)
    expect(
      compareFieldVersions(
        version('2026-11-17T10:00:00.000Z', 'b', 'a'),
        version('2026-11-17T10:00:00.000Z', 'a', 'z'),
      ),
    ).toBeGreaterThan(0)
    expect(
      compareFieldVersions(
        version('2026-11-17T10:00:00.000Z', 'a', 'b'),
        version('2026-11-17T10:00:00.000Z', 'a', 'a'),
      ),
    ).toBeGreaterThan(0)
  })

  it('rejects invalid version timestamps rather than guessing', () => {
    expect(() =>
      compareFieldVersions(version('invalid', 'a', '1'), undefined),
    ).toThrow('بيانات إصدار الحقل غير صالحة.')
  })
})
