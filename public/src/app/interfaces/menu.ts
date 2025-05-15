import { Product } from "./product";

export interface Menu {
    menu_id ?: string;
    menu_date ?: string;
    menu_product?: Product;
    menu_provider_id ?: string;
}
