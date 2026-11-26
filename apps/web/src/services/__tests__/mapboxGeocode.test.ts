import {
  mapboxFeatureToCheckoutAddress,
  suggestionAddressLine,
  type MapboxAddressSuggestion,
  type MapboxGeocodingFeature,
} from '@/services/mapboxGeocode'

const streetFeature: MapboxGeocodingFeature = {
  id: 'address.1',
  type: 'Feature',
  place_type: ['address'],
  text: 'Nguyễn Huệ',
  place_name: 'Nguyễn Huệ, 56100, Phường 5, Tuy Hòa, Đắk Lắk, Việt Nam',
  properties: { accuracy: 'street' },
  context: [
    { id: 'postcode.1', text: '56100' },
    { id: 'locality.1', text: 'Phường 5' },
    { id: 'place.1', text: 'Tuy Hòa' },
  ],
}

const suggestionOf = (
  feature: MapboxGeocodingFeature,
): MapboxAddressSuggestion => {
  const [primaryText = '', ...rest] = feature.place_name.split(', ')
  return {
    id: feature.id,
    placeName: feature.place_name,
    primaryText,
    secondaryText: rest.join(', '),
    feature,
  }
}

describe('suggestionAddressLine', () => {
  it('keeps the house number the shopper typed when the suggestion is a street', () => {
    expect(
      suggestionAddressLine(suggestionOf(streetFeature), '45 Nguyễn Huệ'),
    ).toBe('45 Nguyễn Huệ')
  })

  it.each([
    ['12A Nguyen Hue', '12A'],
    ['12/3 Nguyen Hue', '12/3'],
    ['số 8 Nguyen Hue', '8'],
  ])('reads the typed house number from %p', (typed, number) => {
    expect(suggestionAddressLine(suggestionOf(streetFeature), typed)).toBe(
      `${number} Nguyễn Huệ`,
    )
  })

  it('uses the house number of an address suggestion that has one', () => {
    const numbered = {
      ...streetFeature,
      address: '45',
      place_name: '45 Nguyễn Huệ, 56100, Phường 5, Tuy Hòa, Việt Nam',
    }

    expect(suggestionAddressLine(suggestionOf(numbered), '4')).toBe(
      '45 Nguyễn Huệ',
    )
  })

  it('does not add the typed number again when the suggestion already holds it', () => {
    const alley = {
      ...streetFeature,
      text: 'Ngõ 45 Nguyễn Hữu Tuệ',
      place_name: 'Ngõ 45 Nguyễn Hữu Tuệ, 04200, Gia Viên, Hải Phòng',
    }

    expect(suggestionAddressLine(suggestionOf(alley), '45 Nguyễn')).toBe(
      'Ngõ 45 Nguyễn Hữu Tuệ',
    )
  })

  it('keeps the street alone when the shopper typed no house number', () => {
    expect(
      suggestionAddressLine(suggestionOf(streetFeature), 'Nguyễn Huệ'),
    ).toBe('Nguyễn Huệ')
  })
})

describe('mapboxFeatureToCheckoutAddress', () => {
  it('puts the feature house number before the street', () => {
    expect(
      mapboxFeatureToCheckoutAddress({ ...streetFeature, address: '45' })
        .addressLine,
    ).toBe('45 Nguyễn Huệ')
  })
})
