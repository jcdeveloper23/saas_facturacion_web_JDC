import { Product } from "./product";

export interface Orders {
    order_provider_name?: string;
    order_provider_email?: string;
    order_provider_id?: string;
    order_transaccion_id?: string;
    order_subtotal_price?: number;
    order_representative_id?: string;
    order_representative_name?: string;
    order_student_id?: string;
    order_student_uid?: string;
    order_time?: string;
    order_date?: string;
    order_state?: boolean;
    arrayProductCart?: Product[];
    order_total_to_pay?: number;
    order_payment_method?: string;
    order_length_products ?: number;
    order_student_name ?: string;
    order_update_state_date ?: string;
    order_update_state_time ?: string;
    order_state_payment_method ?: boolean;
    order_image_payment_cash ?: string;
    order_state_payment_method_string ?: string;
    order_state_payment_to_super_admin ?: boolean;
    order_qr_value?: any;
    order_student_level ?: string;
}
