export interface PaymentMethod {
    payment_method_?: string;
    payment_method_id?: string;
    payment_method_type?: string; 
    payment_method_creditCard?: string;
    payment_method_cash?:string;
    payment_method_creditCard_number?: string;
    payment_method_representative_id?: string;
    payment_method_creditCard_name?: string;
    payment_method_expirationDate?: string;
    payment_method_creditCard_cvc?: string;
    payment_method_creditCard_email?: string;
    payment_method_creditCard_phone?:string;
    payment_method_email?: string;
    payment_method_phone?: string;
    payment_method_cash_state?: boolean;
    payment_method_cash_shippingDate?:string;
    payment_method_cash_voucher?:string;
    paymente_method_maximum_payment_date?: string;

    bin?: string;
    expiry_month?: string;
    expiry_year?: string;
    holder_name?: string;
    number?: string;
    status?: string;
    token?: string;
    transaction_reference?: string;
}

export interface PaymentMethodTypes {
    payment_method_type_id?: string;
    payment_method_type_value?: string;
    payment_method_type_title?: string;
    payment_method_type_subtitle?:string;
    payment_method_type_description?: string;
    payment_method_type_details?: Array<string>;
}