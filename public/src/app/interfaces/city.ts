declare interface PriceRange {
  minKm?: number,
  maxKm?: number,
  pricePerKm?: number,
  description?: string
}

declare interface ServicePricing {
  serviceTypeId?: string,
  serviceTypeName?: string,
  serviceIcon?: string,
  serviceNumberOfPassengers?: number,
  serviceNumberOfLuggage?: number,
  basePrice?: number,
  pricePerKm?: number,
  minimumDistanceIncluded?: number,
  priceRanges?: PriceRange[],
  pricePerMinute?: number,
  nightSurchargePercent?: number,
  nightSurchargeStartHour?: string,
  nightSurchargeEndHour?: string,
  isActive?: boolean
}

declare interface City {
  cityId?: string,
  cityCode?: string,
  cityCountyId?: string,
  cityName?: string,
  cityRegisterDate?: string,
  cityState?: boolean,
  cityLat?: number,
  cityLng?: number,
  citySupportNumber?: string,
  cityCurrency?: string,
  cityServicePricing?: ServicePricing[],
  cityTimezone?: string,
  cityCoverageRadiusKm?: number,
  cityUpdatedAt?: string
}
