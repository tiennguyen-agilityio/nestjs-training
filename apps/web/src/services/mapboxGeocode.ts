const MAPBOX_GEOCODE_BASE = 'https://api.mapbox.com/geocoding/v5/mapbox.places'

const MAPBOX_ACCESS_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN

export interface MapboxContextItem {
  id: string
  text?: string
  short_code?: string
}

export interface MapboxGeocodingFeature {
  id: string
  type: string
  place_type?: string[]
  text: string
  place_name: string
  address?: string
  properties?: Record<string, unknown>
  context?: MapboxContextItem[]
}

interface MapboxGeocodingResponse {
  type?: string
  features?: MapboxGeocodingFeature[]
}

export interface MapboxAddressSuggestion {
  id: string
  placeName: string
  primaryText: string
  secondaryText: string
  feature: MapboxGeocodingFeature
}

export interface MapboxParsedAddress {
  addressLine: string
  city: string
  district: string
  ward: string
  postalCode: string
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isAdministrativeCode(value: string): boolean {
  const normalized = value.trim()
  if (!normalized) {
    return false
  }
  return /^[0-9]{1,4}$/.test(normalized)
}

function extractVietnamDistrictFromText(text: string): string {
  const match =
    /\b((?:Quận|Quan|Q\.|Huyện|Huyen|H\.|Thị xã|Thi xa|TX\.)\s*[^,]+)/iu.exec(
      text,
    )
  return match?.[1]?.trim() ?? ''
}

function extractVietnamWardFromText(text: string): string {
  const match = /\b((?:Phường|Phuong|P\.|Xã|Xa)\s*[^,]+)/iu.exec(text)
  return match?.[1]?.trim() ?? ''
}

function contextText(feature: MapboxGeocodingFeature, prefix: string): string {
  const item = feature.context?.find((c) => c.id.startsWith(`${prefix}.`))
  return normalizeString(item?.text)
}

export function mapboxFeatureToCheckoutAddress(
  feature: MapboxGeocodingFeature,
): MapboxParsedAddress {
  const number = normalizeString(feature.address)
  const street = normalizeString(feature.text)
  const addressLine =
    [number, street].filter(Boolean).join(' ').trim() ||
    feature.place_name.split(',')[0]?.trim() ||
    feature.place_name

  const postcode = contextText(feature, 'postcode')
  const place = contextText(feature, 'place')
  const region = contextText(feature, 'region')
  const districtMeta = contextText(feature, 'district')
  const districtFromContext = isAdministrativeCode(districtMeta)
    ? ''
    : districtMeta
  const locality = contextText(feature, 'locality')
  const neighborhood = contextText(feature, 'neighborhood')

  const linesBlob = [
    feature.place_name,
    locality,
    neighborhood,
    districtMeta,
  ].join(' ')

  const districtFromRegex = extractVietnamDistrictFromText(linesBlob)
  const wardFromRegex = extractVietnamWardFromText(linesBlob)

  let city = place || region
  let district = districtFromContext
  let ward = neighborhood || locality

  if (!ward && locality && /phường|phuong|xã|xa|p\./iu.test(locality)) {
    ward = locality
    district = districtFromContext || districtFromRegex
  } else if (
    !district &&
    locality &&
    /quận|quan|huyện|huyen/iu.test(locality)
  ) {
    district = locality
    ward = neighborhood || wardFromRegex
  } else {
    district = district || districtFromRegex
    ward = ward || wardFromRegex
  }

  if (!city) {
    city = region
  }

  return {
    addressLine,
    city,
    district,
    ward,
    postalCode: postcode,
  }
}

const TYPED_HOUSE_NUMBER = /^\s*(?:số\s+)?(\d[\p{L}\d/-]*)\s/iu

export function suggestionAddressLine(
  suggestion: MapboxAddressSuggestion,
  typedLine: string,
): string {
  const street = suggestion.primaryText.trim()
  const houseNumber =
    normalizeString(suggestion.feature.address) ||
    (TYPED_HOUSE_NUMBER.exec(typedLine)?.[1] ?? '')
  if (!houseNumber || street.split(/\s+/).includes(houseNumber)) {
    return street
  }
  return `${houseNumber} ${street}`
}

function mapFeatureToSuggestion(
  feature: MapboxGeocodingFeature,
): MapboxAddressSuggestion | null {
  const id = normalizeString(feature.id)
  const placeName = normalizeString(feature.place_name)
  if (!id || !placeName) {
    return null
  }

  const parts = placeName.split(',').map((s) => s.trim())
  const primaryText = parts[0] ?? placeName
  const secondaryText = parts.slice(1).join(', ')

  return {
    id,
    placeName,
    primaryText,
    secondaryText,
    feature,
  }
}

export async function findMapboxAddressSuggestions(
  query: string,
): Promise<
  | { ok: true; suggestions: MapboxAddressSuggestion[] }
  | { ok: false; error: string }
> {
  const token = normalizeString(MAPBOX_ACCESS_TOKEN)
  if (!token) {
    return {
      ok: false,
      error: 'Mapbox access token is missing',
    }
  }

  const trimmed = query.trim()
  if (!trimmed) {
    return { ok: true, suggestions: [] }
  }

  const pathSegment = encodeURIComponent(trimmed)
  const url = new URL(`${MAPBOX_GEOCODE_BASE}/${pathSegment}.json`)
  url.searchParams.set('access_token', token)
  url.searchParams.set('country', 'vn')
  url.searchParams.set('limit', '6')
  url.searchParams.set('language', 'vi')
  url.searchParams.set('autocomplete', 'true')
  url.searchParams.set(
    'types',
    'address,place,locality,neighborhood,postcode,region,district',
  )

  try {
    const response = await fetch(url.toString())
    if (!response.ok) {
      return {
        ok: false,
        error: `Could not fetch address suggestions (${response.status})`,
      }
    }

    const data = (await response.json()) as MapboxGeocodingResponse
    const suggestions = (data.features ?? [])
      .map(mapFeatureToSuggestion)
      .filter((item): item is MapboxAddressSuggestion => Boolean(item))

    return {
      ok: true,
      suggestions,
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Network error',
    }
  }
}
