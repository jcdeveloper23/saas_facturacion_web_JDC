import { Component, OnInit } from '@angular/core';
import { Users } from 'app/interfaces/users';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';

//Metadata
export interface RouteInfo {
    path: string;
    title: string;
    type: string;
    collapse?: string;
    icontype: string;
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


/// *** Menu Items SUPER ADMIN ***
export const ROUTES_SUPER_ADMIN: RouteInfo[] = [
    {
        path: '/admin-panel',
        title: 'Panel de Control',
        type: 'link',
        icontype: 'nc-icon nc-chart-pie-35'
    },
    {
        path: '/monitor',
        title: 'Monitor en Vivo',
        type: 'link',
        icontype: 'nc-icon nc-tv-2'
    },
    {
        path: '/users',
        title: 'Gestión de Usuarios',
        type: 'link',
        icontype: 'nc-icon nc-circle-10',
    },
    {
        path: '/notifications',
        title: 'Alertas y Notificaciones',
        type: 'link',
        icontype: 'nc-icon nc-bell-55'
    },
    {
        path: '/cities',
        title: 'Ciudades y Zonas',
        type: 'link',
        icontype: 'nc-icon nc-pin-3'
    },
    {
        path: '/countries',
        title: 'Países',
        type: 'link',
        icontype: 'nc-icon nc-globe-2'
    }
];

@Component({
    selector: 'sidebar-cmp',
    styleUrls: ['./sidebar.component.css'],
    templateUrl: 'sidebar.component.html',
})

export class SidebarComponent implements OnInit {
    public menuItems: any[];
    public infoUser: Users;

    isNotMobileMenu() {
        if (window.outerWidth > 991) {
            return false;
        }
        return true;
    }

    constructor() { }

    ngOnInit() {
        this.infoUser = JSON.parse(localStorage.getItem("infoUser"));
        if (!this.infoUser) return;

        // Simplify menu logic based on roles
        if (this.infoUser.userCurrentRole !== undefined && this.infoUser.userCurrentRole.toString() === '0') {
            ROUTES = ROUTES_SUPER_ADMIN;
        } else {
            // Default or restricted menu for other roles
            ROUTES = [
                {
                    path: '/monitor',
                    title: 'Monitor',
                    type: 'link',
                    icontype: 'nc-icon nc-tv-2'
                }
            ];
        }

        this.menuItems = ROUTES.filter(menuItem => menuItem);
        this.loadSavedOrder();
    }

    drop(event: CdkDragDrop<RouteInfo[]>) {
        moveItemInArray(this.menuItems, event.previousIndex, event.currentIndex);
        this.saveOrder();
    }

    saveOrder() {
        if (!this.infoUser) return;
        const order = this.menuItems.map(item => item.path);
        localStorage.setItem(`sidebar_order_${this.infoUser.userCurrentRole}`, JSON.stringify(order));
    }

    loadSavedOrder() {
        if (!this.infoUser) return;
        const savedOrder = localStorage.getItem(`sidebar_order_${this.infoUser.userCurrentRole}`);
        if (savedOrder && this.menuItems) {
            const order: string[] = JSON.parse(savedOrder);
            const itemMap = new Map(this.menuItems.map(item => [item.path, item]));
            const newMenuItems = [];

            order.forEach(path => {
                if (itemMap.has(path)) {
                    newMenuItems.push(itemMap.get(path));
                    itemMap.delete(path);
                }
            });

            itemMap.forEach(item => {
                newMenuItems.push(item);
            });

            this.menuItems = newMenuItems;
        }
    }
}
