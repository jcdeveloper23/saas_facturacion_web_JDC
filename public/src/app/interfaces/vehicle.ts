export interface Vehicle {
  vehicleId?: string;
  vehicleBrand?: VehicleBrand;
  vehicleBrandId?: string;
  vehicleBrandName?: string;
  vehicleModel?: string;
  vehicleModelName?: string;
  vehicleYear?: string;
  vehicleYearName?: string;
  vehiclePlateNumber?: string;
  vehicleTypeWork?: string;
  vehicleState?: boolean;

  vehicleDocumentUploaded?: boolean;
  vehicleDocumentVerified?: boolean;
  vehicleDocumentCarURL?: string;
  vehicleDocumentCarSureUploaded?: boolean;
  vehicleDocumentCarSureURL?: string;
  vehicleSureVerified?: boolean;
  vehicleInReview?: boolean;

  vehicleDocumentRejectionReason?: string;
  vehicleSureRejectionReason?: string;
}

export interface VehicleBrand {
  categoriesIcon?: any;
  categoriesState?: boolean;
  categoriesIsSelected?: boolean;
  categoriesIsMain?: boolean;
  categoriesIsPremium?: boolean;
  categoriesAllowsMultipleSelection?: boolean;
  categoriesName?: string;
  categoriesCode?: string;
  categoriesDescription?: string;
  categoriesDateRegister?: string; // ISO date string
  categoriesId?: string;
  categoriesTimeRegister?: string;
  categoriesParent?: string;
  categoriesType?: string;
  categoriesPrice?: any;
  categoriesNumberOfPassengers?: any;
  categoriesNumberOfLuggage?: any;
}
