import { Component, OnInit, AfterViewInit, AfterViewChecked, AfterContentInit } from '@angular/core';
import { Orders } from 'app/interfaces/orders';
import { Provider } from 'app/interfaces/provider';
import { Users } from 'app/interfaces/users';
import { OrdersService } from 'app/services/orders/orders.service';
import { ProviderService } from 'app/services/provider/provider.service';
import { take } from 'rxjs/operators';

//Metadata
export interface RouteInfo {
    path: string;
    title: string;
    type: string;
    collapse?: string;
    icontype: string;
    // icon: string;
    children?: ChildrenItems[];
}

export interface ChildrenItems {
    path: string;
    title: string;
    ab: string;
    icontype?: string;
    type?: string;
}

export var ROUTES: RouteInfo[] = [];


/// *** Menu Items Representative ***
export const ROUTES_REPRESENTATIVE: RouteInfo[] = [

    {
        path: '/perfil-representative/childrens',
        title: 'Mis estidiantes',
        type: 'link',
        icontype: 'nc-icon nc-single-02'
    },
    {
        path: '/perfil-representative/paymentMethods',
        title: 'Mis métodos de pago',
        type: 'link',
        icontype: 'nc-icon nc-circle-10'
    },
    {
        path: '/perfil-representative/perfil',
        title: 'Mi perfil',
        type: 'link',
        icontype: 'nc-icon nc-circle-10'
    },
];
/// *** Menu Items BAR EN ESTADO DE PAGO FALSO***
export const ROUTES_BAR_SATATE_FALSE: RouteInfo[] = [
    {
        path: '/perfil',
        title: 'Empresa',
        type: 'link',
        icontype: 'nc-icon nc-single-02'
    }
]
/// *** Menu Items BAR ***
export const ROUTES_BAR: RouteInfo[] = [
    // {
    //     path: '/imports-representative',
    //     title: 'Importar Rep',
    //     type: 'link',
    //     icontype: 'nc-icon nc-single-02'
    // },
    {
        path: '/dashboard',
        title: 'Resumen general',
        type: 'link',
        icontype: 'nc-icon nc-chart-bar-32' // Icono de estadísticas
    },
    {
        path: '/deliverOrders',
        title: 'Órdenes a entregar',
        type: 'link',
        icontype: 'nc-icon nc-delivery-fast' // Representa envíos
    },
    {
        path: '/paymentConfirmation',
        title: 'Confirmar pagos',
        type: 'link',
        icontype: 'nc-icon nc-credit-card' // Icono de pagos
    },
    {
        path: '/inventory/admin-products',
        title: 'Gestión de productos',
        type: 'link',
        icontype: 'nc-icon nc-box' // Mismo icono pero ahora más claro en el título
    },
    {
        path: '/inventory/lines',
        title: 'Categorías de productos',
        type: 'link',
        icontype: 'nc-icon nc-bullet-list-67' // Mejora visual sobre tags
    },
    {
        path: '/inventory/coupons',
        title: 'Paquetes de recarga',
        type: 'link',
        icontype: 'nc-icon nc-tag-content' // Más representativo de promociones
    },
    {
        path: '/perfil',
        title: 'Perfil del bar',
        type: 'link',
        icontype: 'nc-icon nc-single-02' // Más enfocado en perfil
    }

    // {
    //     path: '/inventory/upload',
    //     title: 'Subir',
    //     type: 'link',
    //     icontype: 'nc-icon nc-single-copy-04'
    // },
    // {
    //     path: '/inventory/products',
    //     title: 'Inventario',
    //     type: 'sub',
    //     collapse: 'inventory',
    //     icontype: 'nc-icon nc-box-2',
    //     children: [
    //         // {
    //         //     path: 'lines',
    //         //     title: 'Categorías',
    //         //     ab: 'C',
    //         //     icontype: 'nc-icon nc-box-2'
    //         // },
    //         // {
    //         //     path: 'products',
    //         //     title: 'Productos',
    //         //     ab: 'P',
    //         //     icontype: 'nc-icon nc-box-2'
    //         // },
    //         {
    //             path: 'coupons',
    //             title: 'Cupones',
    //             ab: 'C',
    //             icontype: 'nc-icon nc-box-2'
    //         },
    //     ]
    // },
    // {
    //     path: '/supplie-reports',
    //     title: 'Reportes',
    //     type: 'sub',
    //     collapse: 'reports',
    //     icontype: 'nc-icon nc-paper',
    //     children: [
    //         { path: 'orders', title: 'Pedidos', ab: 'P' },
    //         { path: 'report', title: 'Reporte de ventas', ab: 'R' },
    //     ]
    // },
    // {
    //     path: '/users',
    //     title: 'Usuarios',
    //     type: 'sub',
    //     collapse: 'users',
    //     icontype: 'nc-icon nc-circle-10',
    //     children: [
    //         { path: 'representative', title: 'Representantes', ab: 'R' },
    //         { path: 'students', title: 'Estudiantes', ab: 'A' },
    //         { path: 'requestStudents', title: 'Nuevas solicitudes', ab: 'NS' },
    //     ]
    // },
];

/// *** Menu Items SUPER ADMIN ***
export const ROUTES_SUPER_ADMIN: RouteInfo[] = [
    {
        path: '/countries',
        title: 'Países',
        type: 'link',
        icontype: 'nc-icon nc-globe'
    },
    {
        path: '/cities',
        title: 'Ciudades',
        type: 'link',
        icontype: 'nc-icon nc-settings'
    },
    {
        path: '/registerProcess',
        title: 'Pasos de registro',
        type: 'link',
        icontype: 'nc-icon nc-settings'
    },
    {
        path: '/categories',
        title: 'Categorías',
        type: 'link',
        icontype: 'nc-icon nc-settings'
    },
    {
        path: '/bcvRate',
        title: 'Tasa BCV',
        type: 'link',
        icontype: 'nc-icon nc-settings'
    },
    {
        path: '/paymentMethod',
        title: 'Métodos de pago',
        type: 'link',
        icontype: 'nc-icon nc-settings'
    },
    {
        path: '/recharges',
        title: 'Recargas',
        type: 'link',
        icontype: 'nc-icon nc-settings'
    },
    // {
    //     path: '/provider-administration',
    //     title: 'Proveedores',
    //     type: 'link',
    //     icontype: 'nc-icon nc-cart-simple'
    // },
    // {
    //     path: '/school',
    //     title: 'Unidades Educativas',
    //     type: 'link',
    //     icontype: 'nc-icon nc-zoom-split'
    // },
    // {
    //     path: '/users',
    //     title: 'Usuarios',
    //     type: 'sub',
    //     collapse: 'users',
    //     icontype: 'nc-icon nc-circle-10',
    //     children: [
    //         { path: 'representative', title: 'Representantes', ab: 'R' },
    //         { path: 'students', title: 'Estudiantes', ab: 'A' },
    //     ]
    // },
    {
        path: '/users',
        title: 'Usuarios',
        type: 'link',
        collapse: 'users',
        icontype: 'nc-icon nc-circle-10',
    },
    // {
    //     path: '/countries',
    //     title: 'Países',
    //     type: 'link',
    //     icontype: 'nc-icon nc-globe'
    // }, {
    //     path: '/allergies',
    //     title: 'Alergias',
    //     type: 'link',
    //     icontype: 'nc-icon nc-globe'
    // },

];

/// *** Menu Items ALL ***
export const ROUTES_ALL: RouteInfo[] = [
    {
        path: '/perfil',
        title: 'Empresa',
        type: 'link',
        icontype: 'nc-icon nc-single-02'
    }, {
        path: '/inventory',
        title: 'Inventario',
        type: 'sub',
        collapse: 'inventory',
        icontype: 'nc-icon nc-box-2',
        children: [
            { path: 'lines', title: 'Categorías', ab: 'L' },
            // {path: 'groups', title: 'Grupos', ab:'G'},
            { path: 'products', title: 'Productos', ab: 'P' },
            { path: 'upload', title: 'Inventario inicial', ab: 'II' },
        ]
    },
    {
        path: '/supplie-reports',
        title: 'Reportes',
        type: 'sub',
        collapse: 'reports',
        icontype: 'nc-icon nc-paper',
        children: [
            { path: 'orders', title: 'Pedidos', ab: 'P' },
            { path: 'report', title: 'Reporte de ventas', ab: 'RV' },
        ]
    },
    {
        path: '/users',
        title: 'Usuarios',
        type: 'sub',
        collapse: 'users',
        icontype: 'nc-icon nc-circle-10',
        children: [
            { path: 'representative', title: 'Representantes', ab: 'R' },
            { path: 'students', title: 'Estudiantes', ab: 'A' },

        ]
    },
    {
        path: '/provider-administration',
        title: 'Proveedores',
        type: 'link',
        icontype: 'nc-icon nc-cart-simple'
    },
    {
        path: '/school',
        title: 'Unidades Educativas',
        type: 'link',
        icontype: 'nc-icon nc-zoom-split'
    },

    // {
    //     path: '/dashboard',
    //     title: 'Dashboard',
    //     type: 'link',
    //     icontype: 'nc-icon nc-bank'
    // },
    // {
    //     path: '/components',
    //     title: 'Components',
    //     type: 'sub',
    //     collapse: 'components',
    //     icontype: 'nc-icon nc-layout-11',
    //     children: [
    //         {path: 'buttons', title: 'Buttons', ab:'B'},
    //         {path: 'grid', title: 'Grid System', ab:'GS'},
    //         {path: 'panels', title: 'Panels', ab:'P'},
    //         {path: 'sweet-alert', title: 'Sweet Alert', ab:'SA'},
    //         {path: 'notifications', title: 'Notifications', ab:'N'},
    //         {path: 'icons', title: 'Icons', ab:'I'},
    //         {path: 'typography', title: 'Typography', ab:'T'}
    //     ]
    // },
    // ,{
    //     path: '/forms',
    //     title: 'Forms',
    //     type: 'sub',
    //     collapse: 'forms',
    //     icontype: 'nc-icon nc-ruler-pencil',
    //     children: [
    //         {path: 'regular', title: 'Regular Forms', ab:'RF'},
    //         {path: 'extended', title: 'Extended Forms', ab:'EF'},
    //         {path: 'validation', title: 'Validation Forms', ab:'VF'},
    //         {path: 'wizard', title: 'Wizard', ab:'W'}
    //     ]
    // },
    // ,{
    //     path: '/tables',
    //     title: 'Tables',
    //     type: 'sub',
    //     collapse: 'tables',
    //     icontype: 'nc-icon nc-single-copy-04',
    //     children: [
    //         {path: 'regular', title: 'Regular Tables', ab:'RT'},
    //         {path: 'extended', title: 'Extended Tables', ab:'ET'},
    //         {path: 'datatables.net', title: 'Datatables.net', ab:'DT'}
    //     ]
    // },{
    //     path: '/maps',
    //     title: 'Maps',
    //     type: 'sub',
    //     collapse: 'maps',
    //     icontype: 'nc-icon nc-pin-3',
    //     children: [
    //         {path: 'google', title: 'Google Maps', ab:'GM'},
    //         {path: 'fullscreen', title: 'Full Screen Map', ab:'FSM'},
    //         {path: 'vector', title: 'Vector Map', ab:'VM'}
    //     ]
    // },{
    //     path: '/widgets',
    //     title: 'Widgets',
    //     type: 'link',
    //     icontype: 'nc-icon nc-box'

    // },{
    //     path: '/charts',
    //     title: 'Charts',
    //     type: 'link',
    //     icontype: 'nc-icon nc-chart-bar-32'

    // },{
    //     path: '/calendar',
    //     title: 'Calendar',
    //     type: 'link',
    //     icontype: 'nc-icon nc-calendar-60'
    // },

    {
        path: '/perfil-representative/perfil',
        title: 'Perfil',
        type: 'link',
        icontype: 'nc-icon nc-circle-10'
    },
    {
        path: '/perfil-representative/childrens',
        title: 'Estudiantes',
        type: 'link',
        icontype: 'nc-icon nc-single-02'
    },
    {
        path: '/pages',
        title: '(LP) Reg. proveedor',
        collapse: 'pages',
        type: 'sub',
        icontype: 'nc-icon nc-book-bookmark',
        children: [
            // {path: 'timeline', title: 'Timeline Page', ab:'T'},
            // {path: 'user', title: 'User Page', ab:'UP'},
            // {path: 'login', title: 'Iniciar sesión', ab:'LP'},
            // {path: 'register', title: 'Register Page', ab:'RP'},
            { path: 'register-provider', title: 'Registrar', ab: 'RPP' },
            // {path: 'lock', title: 'Lock Screen Page', ab:'LSP'}
        ]
    },
    {
        path: '/pages/login',
        title: 'Iniciar sesión',
        type: 'link',
        icontype: 'nc-icon nc-single-02'
    },
    {
        path: 'scanner',
        title: 'Scanner',
        type: 'link',
        icontype: 'nc-icon nc-single-02'
    },

];

@Component({
    moduleId: module.id,
    selector: 'sidebar-cmp',
    styleUrls: ['./sidebar.component.css'],
    templateUrl: 'sidebar.component.html',
})

export class SidebarComponent {
    public menuItems: any[];
    public infoUser: Users;
    public provider_id: string = '';
    public provider: Provider;
    public arrayOrders: Array<Orders> = [];

    audioNewOrder = new Audio('../../../../assets/sound/notify2.mp3');
    previousOrderIds: Set<string> = new Set();

    isNotMobileMenu() {
        if (window.outerWidth > 991) {
            return false;
        }
        return true;
    }
    constructor(
        private providerService: ProviderService,
        private ordersService: OrdersService,
    ) { }

    async ngOnInit() {
        this.provider = {};
        this.infoUser = JSON.parse(localStorage.getItem("infoUser"));
        if (this.infoUser.userRol.toString() == '2') {
            ROUTES = (ROUTES_REPRESENTATIVE);
            this.menuItems = ROUTES.filter(menuItem => menuItem);
        } else if (this.infoUser.userRol.toString() == '1') {
            this.providerService.getProviderId(this.infoUser.userId).pipe(take(1)).subscribe(provider => {
                this.provider = provider;
                /// *** OJO negar ***
                if (this.provider.provider_state_method) {
                    ROUTES = (ROUTES_BAR);
                } else {
                    ROUTES = (ROUTES_BAR_SATATE_FALSE);
                }
                this.menuItems = ROUTES.filter(menuItem => menuItem);
            })
        } else if (this.infoUser.userRol.toString() == '0') {
            ROUTES = (ROUTES_SUPER_ADMIN);
            this.menuItems = ROUTES.filter(menuItem => menuItem);
        }
        // this.getOrdersConfirmationPending('')
    }

    public getOrdersConfirmationPending(value: string) {
        this.ordersService.getAllOrdersConfirmationPending(this.infoUser.userId, value).subscribe((orders: Array<Orders>) => {
            const currentIds = new Set(orders.map(order => order.order_transaccion_id));

            // Verifica si hay un nuevo ID que antes no existía
            let newOrderDetected = false;
            currentIds.forEach(id => {
                if (!this.previousOrderIds.has(id)) {
                    newOrderDetected = true;
                }
            });

            if (newOrderDetected) {
                this.playNewOrderSound();
            }

            this.previousOrderIds = currentIds;
            this.arrayOrders = orders;
        });
    }

    playNewOrderSound() {
        this.audioNewOrder.play().catch(err => {
            console.warn('Audio playback failed:', err);
        });
    }

    /**
     * Metodo para consultar información del bar
     */
    getProvider() {
        this.providerService.getProviderId(this.provider_id).pipe(take(1)).subscribe(provider => {
            this.provider = provider;
        })
    }

    ngAfterViewInit() {
    }
}
