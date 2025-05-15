export interface Product {
    product_id ?: string;
    product_name ?: string;
    product_description ?: string;
    product_id_category ?: string;
    product_id_category_name ?: string;
    product_price ?: number;
    product_images ?: Array<string>;
    product_observations ?: string;
    product_state ?: boolean;
    product_days_of_availability ?: Array<number>;
    product_provider_id ?: string;
    product_order_delivery_date ?: string;
    product_quantity_in_cart ?: number;
    product_delivery_method?: string;
    product_id_student ?: string;
    product_subtotal ?: number;
    product_id_transaction?: string;
    product_state_in_order ?: boolean;
    product_delivery_date ?: string;
    product_dalivery_time ?: string;
    product_state_in_menu ?: boolean;
    product_qr_value ?: string;
}
