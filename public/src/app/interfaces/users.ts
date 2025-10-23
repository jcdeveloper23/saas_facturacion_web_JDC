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

    userWalletBalance?: string;
    userWalletLastUpdate?: string;
    userWalletCurrency?: string;

    userClientAccountIsVerify?: boolean;
    userDriverAccountIsVerify?: boolean;

}
