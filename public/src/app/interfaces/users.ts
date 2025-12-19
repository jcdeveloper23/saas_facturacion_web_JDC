// Historial de cambios de comisión
export interface CommissionHistory {
    date: string;
    time: string;
    previousRate: number;
    newRate: number;
    updatedBy: string;
    reason?: string;
}

export interface Users {

    userId?: string;
    userUid?: string;
    userName?: string;
    userIdSchool?: string;
    userIdentification?: string;
    userAddress?: string;
    userCity?: string;
    userCountry?: string;
    userPhone?: string;
    userCodeCountry?: string;
    userEmail?: string;
    userPassword?: string;
    userRegisterDate?: string;
    userPhotoURL?: string;
    userIdentificationFrontImage?: string;
    userIdentificationBackImage?: string;
    userDocumentCarURL?: string;
    driverActiveCarRequest?: string;
    userRating?: string;
    userTypeWork?: string;
    userRegisterTime?: string;
    userRolName?: string;
    usersLastSignInFilter?: string;
    userTokenMessaging?: string;
    userMessagingToken?: string;
    userAboutMe?: string;
    usersAccountType?: string;
    userBlockAccountDate?: string;
    userBlockAccountTime?: string;
    userBlockAccountMotive?: string;
    usersLastSignIn?: string;

    userAcceptTerms?: boolean;
    userPhotoUploaded?: boolean;
    userTutorial?: boolean;
    userState?: boolean;
    userStateShareLocation?: boolean;
    userAccountBlock?: boolean;
    userIsLoginWithApple?: boolean;
    userDocumentCarUploaded?: boolean;

    userLatitude?: number;
    userLongitude?: number;
    userLastLocationLatitude?: number;
    userLastLocationLongitude?: number;
    userLastLocationDate?: string;
    userRol?: number;

    userDniURL?: string;
    userDniUploaded?: boolean;
    userLicenceURL?: string;
    userLicenseUploaded?: boolean;
    userDniVerified?: boolean;
    userLicenceVerified?: boolean;
    userIsAdminImove?: boolean;

    // Verificación individual de documentos
    userDocumentCarVerified?: boolean;
    userIdentificationFrontVerified?: boolean;
    userIdentificationBackVerified?: boolean;

    // Validación Administrativa (Manual)
    userAdminDocumentVerified?: boolean;
    userAdminDocumentVerifiedDate?: string;
    userAdminDocumentVerifiedBy?: string;

    // Reason for rejection
    userDocumentCarRejectionReason?: string;
    userIdentificationFrontRejectionReason?: string;
    userIdentificationBackRejectionReason?: string;
    userDniRejectionReason?: string;
    userLicenceRejectionReason?: string;

    userWalletBalance?: string;
    userWalletLastUpdate?: string;
    userWalletCurrency?: string;

    userClientAccountIsVerify?: boolean;
    userDriverAccountIsVerify?: boolean;

    // Sistema de Comisiones
    userCommissionRate?: number; // Porcentaje de comisión (ej: 20 = 20%)
    userCommissionType?: 'percentage' | 'fixed'; // Tipo de comisión
    userCommissionCustomEnabled?: boolean; // Si tiene comisión personalizada
    userCommissionHistory?: CommissionHistory[]; // Historial de cambios
    userCommissionLastUpdate?: string; // Última actualización
    userCommissionUpdatedBy?: string; // Quién actualizó la comisión

    // Metadatos DNI
    userDniNumber?: string;
    userDniExpirationDate?: string;
    userDniIssueDate?: string;
    userDniIssuingAuthority?: string;

    // Metadatos Licencia
    userLicenceNumber?: string;
    userLicenceExpirationDate?: string;
    userLicenceIssueDate?: string;
    userLicenceType?: string; // Tipo A, B, C, etc.
    userLicenceIssuingAuthority?: string;

    // Metadatos Documento de Vehículo (Usuario)
    userDocumentCarNumber?: string;
    userDocumentCarExpirationDate?: string;
    userDocumentCarIssueDate?: string;

    // Audit trail
    userLastUpdated?: string;
    userLastUpdatedBy?: string;

}
