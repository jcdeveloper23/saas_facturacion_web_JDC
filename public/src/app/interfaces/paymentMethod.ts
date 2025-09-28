
declare interface PaymentMethod {
    paymentMethodId?: string;
    paymentMethodName?: string;
    paymentMethodQr?: boolean;
    paymentMethodAdministrator?: string;
    paymentMethodDni?: string;
    paymentMethodBank?: string;
    paymentMethodCountries?: Array<Country>;
    paymentMethodAccountType?: string;
    paymentMethodAccountNumber?: string;
    paymentMethodEmail?: string;
    paymentMethodImage?: string;
    paymentMethodImageQr?: string;
    paymentMethodRegisterDate?: string;
    paymentMethodPhone?: string;
    paymentMethodRegisterTime?: string;
    paymentMethodState?: boolean; 

    paymentMethodShowName?: boolean;
    paymentMethodShowAdmin?: boolean;
    paymentMethodShowDni?: boolean;
    paymentMethodShowBank?: boolean;
    paymentMethodShowEmail?: boolean;
    paymentMethodShowAccountType?: boolean;
    paymentMethodShowAccountNumber?: boolean;
    paymentMethodShowData?: boolean;


    paymentMethodNameTr?: boolean;
    paymentMethodAdminTr?: boolean;
    paymentMethodDniTr?: boolean;
    paymentMethodBankTr?: boolean;
    paymentMethodEmailTr?: boolean;
    paymentMethodAccountTypeTr?: boolean;
    paymentMethodAccountNumberTr?: boolean;
    paymentMethodDataTr?: boolean;
}
