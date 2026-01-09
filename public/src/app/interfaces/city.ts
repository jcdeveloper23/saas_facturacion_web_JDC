export interface PriceRange {
  minKm?: number,
  maxKm?: number,
  pricePerKm?: number,
  description?: string
}

export interface ServicePricing {
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

export interface City {
  // Backend Model Fields (Sequelize)
  id?: number;
  cityName?: string;
  cityCode?: string;
  state?: boolean;
  cityCountryCode?: string;

  // Legacy / Frontend Specific Fields
  cityId?: string;
  cityCountyId?: string;
  cityRegisterDate?: string;
  cityState?: boolean; // Legacy flag
  cityLat?: number;
  cityLng?: number;
  citySupportNumber?: string;
  cityCurrency?: string;
  cityServicePricing?: ServicePricing[];
  cityTimezone?: string;
  cityCoverageRadiusKm?: number;
  cityUpdatedAt?: string;
}
