declare interface RequestVehicle {
    requestDriverCarDescription?:       string;
    requestDriverLocationLat?:          number;
    requestClientRating?:               string;
    requestClientName?:                 string;
    requestFullDate?:                   Request;
    requestClientEmail?:                string;
    requestDescription?:                string;
    requestTotalDistanceOriginDestiny?: number;
    requestLocationOriginLng?:          number;
    requestStatus?:                     string;
    requestDriverPhotoUrl?:             string;
    requestDriverCarBrand?:             string;
    requestCommission?:                 string;
    requestClientIsInTripForDriver?:    boolean;
    requestDriverEarnings?:             string;
    requestDriverCarCompanyName?:       string;
    requestLocationOriginLat?:          number;
    requestTypeService?:                string;
    requestLocationDestinyLng?:         number;
    requestClientIsInTrip?:             boolean;
    requestRegisterDate?:               string;
    requestDriverUid?:                  string;
    requestStop?:                       any[];
    requestCategory?:                   string;
    requestTypeServiceId?:              string;
    requestCategoryName?:               string;
    requestStateOnClient?:              string;
    requestDriverCarModel?:             string;
    requestDriverName?:                 string;
    requestRegisterTime?:               string;
    requestDriverState?:                boolean;
    requestClientUid?:                  string;
    requestStatusTrip?:                 string;
    requestDriverRating?:               string;
    requestDriverPhone?:                string;
    requestPaymentType?:                string;
    requestClientPhone?:                string;
    requestDriverAcceptedAt?:           Request;
    requestClientAddressDestiny?:       string;
    requestDriverLocationLng?:          number;
    requestTotalTimeOriginDestiny?:     number;
    requestTotalDistanceVehicleUser?:   number;
    requestCustomerOffer?:              string;
    requestDriverCarCompany?:           string;
    requestDriverCarPlate?:             string;
    requestClientCity?:                 string;
    requestDriverIsInTrip?:             boolean;
    requestCommissionRate?:             number;
    requestClientAddress?:              string;
    requestLocationDestinyLat?:         number;
    requestState?:                      boolean;
    rejectedBy?:                        any[];
    requestClientAddressOrigin?:        string;
    requestTotalTimeVehicleUser?:       number;
    requestTripCost?:                   string;
    requestDriverIsInSitu?:             boolean;
    requestCoordinatesOriginDestiny?:   RequestCoordinatesOriginDestiny[];
    requestClientPhotoUrl?:             string;
    requestId?:                         string;
}

declare interface RequestCoordinatesOriginDestiny {
    lng?: number;
    lat?: number; 
}

declare interface Request {
    seconds?:     number;
    nanoseconds?: number;
}
