export interface Provider {
    provider_id ?: string;
    provider_ruc ?: string;
    provider_name ?: string;
    provider_address ?: string;
    provider_email ?: string;
    provider_phone ?: string;
    provider_name_contact ?: string;
    provider_id_school ?: string;
    provider_state ?: boolean;
    provider_image ?: string;
    provider_surname ?: string;
    provider_password ?: string;
    provider_business_name ?: string;
    provider_confirm_password ?:string;
    provider_products_offert ?:string;
    provider_uid ?:string;
    provider_state_method ?: boolean;
    provider_NAME_EC_CLIENT?: string;
    provider_KEY_EC_CLIENT?: string;
    provider_NAME_EC_SERVER?: string;
    provider_KEY_EC_SERVER?: string;
    provider_percentage?: number;
}
