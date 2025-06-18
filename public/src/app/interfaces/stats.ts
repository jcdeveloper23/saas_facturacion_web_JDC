export interface Stats {
    totalAmountPerPaymentMethod?: PerPaymentMethod;
    totalOrders?:                 number;
    orderStatus?:                 OrderStatus;
    paymentStatus?:               PaymentStatus;
    totalAmount?:                 number;
    students?:                    { [key: string]: number };
    perPaymentMethod?:            PerPaymentMethod;
}

export interface OrderStatus {
    false?: number;
}

export interface PaymentStatus {
    aceptada?:    number;
    desconocido?: number;
}

export interface PerPaymentMethod {
    tarjeta?:  number;
    efectivo?: number;
}
