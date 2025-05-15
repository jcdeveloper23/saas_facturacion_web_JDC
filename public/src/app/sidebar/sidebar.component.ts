import { Component, OnInit, AfterViewInit, AfterViewChecked, AfterContentInit } from '@angular/core';
import { Provider } from 'app/interfaces/provider';
import { Users } from 'app/interfaces/users';
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
        path: '/perfil-representative/perfil',
        title: 'Mi perfil',
        type: 'link',
        icontype: 'nc-icon nc-circle-10'
    },
    {
        path: '/perfil-representative/paymentMethods',
        title: 'Mis métodos de pago',
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
            { path: 'lines', title: 'Categorías', ab: 'C' },
            // { path: 'groups', title: 'Grupos', ab: 'G' },
            { path: 'products', title: 'Productos', ab: 'P' },
            { path: 'coupons', title: 'Cupones', ab: 'C' },
            // { path: 'upload', title: 'Inventario inicial', ab: 'I' },
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
            { path: 'report', title: 'Reporte de ventas', ab: 'R' },
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
            { path: 'requestStudents', title: 'Nuevas solicitudes', ab: 'NS' },
        ]
    },
];

/// *** Menu Items SUPER ADMIN ***
export const ROUTES_SUPER_ADMIN: RouteInfo[] = [
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
            {path: 'upload', title: 'Inventario inicial', ab:'II'},
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

    isNotMobileMenu() {
        if (window.outerWidth > 991) {
            return false;
        }
        return true;
    }
    constructor(private providerService: ProviderService,) {

    }

    async ngOnInit() {
        this.provider = {};
        this.infoUser = JSON.parse(localStorage.getItem("infoUser"));
        if (this.infoUser.users_account_type == '2') {
            ROUTES = (ROUTES_REPRESENTATIVE);
            this.menuItems = ROUTES.filter(menuItem => menuItem);
        } else if (this.infoUser.users_account_type == '1') {
            this.providerService.getProviderId(this.infoUser.user_id).pipe(take(1)).subscribe(provider => {
                this.provider = provider;
                if (this.provider.provider_state_method) {
                    ROUTES = (ROUTES_BAR);
                } else {
                    ROUTES = (ROUTES_BAR_SATATE_FALSE);
                }
                this.menuItems = ROUTES.filter(menuItem => menuItem);
            })
        } else if (this.infoUser.users_account_type == '0') {
            ROUTES = (ROUTES_SUPER_ADMIN);
            this.menuItems = ROUTES.filter(menuItem => menuItem);
        }
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
