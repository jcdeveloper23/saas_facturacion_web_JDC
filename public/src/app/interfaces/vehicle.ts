export interface Vehicle {
    vehicleId?: string;
    vehiclePlate?: string;
    vehiclePlateNumber?: string;
    vehicleBrand?: string;
    vehicleBrandName?: string;
    vehicleModel?: string;
    vehicleModelName?: string;
    vehicleColor?: string;
    vehicleYear?: string;
    vehicleYearName?: string;
    vehicleVerificationState?: boolean;
    vehicleState?: boolean;
    vehicleInReview?: boolean;

    // Document properties (Legacy for compatibility)
    vehicleDocumentCarURL?: string;
    vehicleDocumentCarSureURL?: string;
    vehicleDocumentVerified?: boolean;
    vehicleSureVerified?: boolean;
    vehicleDocumentUploaded?: boolean;
    vehicleDocumentCarSureUploaded?: boolean;
    vehicleDocumentRejectionReason?: string;
    vehicleSureRejectionReason?: string;

    createdAt?: string;
    updatedAt?: string;
}
