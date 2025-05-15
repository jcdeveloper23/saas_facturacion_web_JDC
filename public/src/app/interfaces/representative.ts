export interface Representative {
    representative_id ?: string;
    representative_identification ?: string;
    representative_name ?: string;
    representative_surname ?: string;
    representative_email ?: string;
    representative_phone ?: string;
    representative_mobile ?: string;
    representative_address ?: string;
    representative_password ?: string;
    representative_password_confirm ?: string;
    representative_state ?: boolean;
    representative_schools ?: Array<any>; /* DUDA */
    representative_students ?: Array<string>;
    representative_image ?: string;
    representative_state_confirm ?: boolean;
    representative_state_confirm_by_bar ?: boolean;
    representative_request_access_state ?: number; // 0: Rechazado, 1: Aprobado, 2: Pendiente
    representative_payment_method ?: string;
    representative_send_email ?: number;
    representative_lective_year ?: string;
}
