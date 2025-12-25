import { Component, OnInit, OnDestroy } from '@angular/core';
import { RequestVehicleService } from '../../../services/request-vehicle/request-vehicle.service';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';

declare var $: any;

@Component({
    selector: 'app-admin-trips-manage',
    templateUrl: './admin-trips-manage.component.html',
    styleUrls: ['./admin-trips-manage.component.css']
})
export class AdminTripsManageComponent implements OnInit, OnDestroy {

    // Viajes cargados
    public allTrips: any[] = [];
    public filteredTrips: any[] = [];

    // Filtros
    public filterStatus: string = 'all';
    public filterDateStart: string = '';
    public filterDateEnd: string = '';

    // Estadísticas
    public stats = {
        totalTrips: 0,
        platformEarnings: 0,
        driverEarnings: 0,
        cancellationRate: 0,
        finishedTrips: 0,
        cancelledTrips: 0
    };

    // Viaje seleccionado para el modal
    public selectedTrip: any = null;
    public lightboxImage: string = '';

    private subscriptions: Subscription[] = [];

    constructor(
        private requestVehicleService: RequestVehicleService,
        private router: Router
    ) { }

    ngOnInit(): void {
        const today = new Date();
        this.filterDateStart = this.formatDate(today);
        this.filterDateEnd = this.formatDate(today);
        this.loadTrips();
    }

    ngOnDestroy(): void {
        this.subscriptions.forEach(sub => sub.unsubscribe());
    }

    goToStats(): void {
        this.router.navigate(['/admin-panel/admin-trips-stats'], {
            queryParams: {
                status: this.filterStatus,
                start: this.filterDateStart,
                end: this.filterDateEnd
            }
        });
    }

    loadTrips(): void {
        // Limpiar subscripciones anteriores
        this.subscriptions.forEach(sub => sub.unsubscribe());
        this.subscriptions = [];

        let statusList: string[] = null;
        if (this.filterStatus !== 'all') {
            if (this.filterStatus === 'pending') statusList = ['requested'];
            else if (this.filterStatus === 'accepted') statusList = ['acceptedByDriver', 'driverIsInSitu'];
            else if (this.filterStatus === 'in_progress') statusList = ['inTravel'];
            else if (this.filterStatus === 'finished') statusList = ['finished', 'Finalizada'];
            else if (this.filterStatus === 'cancelled') statusList = ['cancelledByUser', 'cancelledByDriver', 'Cancelada'];
            else statusList = [this.filterStatus];
        }

        const start = this.filterDateStart ? new Date(this.filterDateStart + 'T00:00:00') : null;
        const end = this.filterDateEnd ? new Date(this.filterDateEnd + 'T23:59:59') : null;

        // Usamos el nuevo método de filtrado en DB
        const sub = this.requestVehicleService.getFilteredRequests(statusList, start, end).subscribe(
            (trips: any[]) => {
                this.allTrips = trips;
                this.filteredTrips = trips;
                this.calculateStats();
                console.log('Trips loaded from DB:', trips.length);
            },
            error => {
                console.error('Error loading filtered trips:', error);
                this.loadTripsAll();
            }
        );
        this.subscriptions.push(sub);
    }

    loadTripsAll(): void {
        const sub = this.requestVehicleService.getAllRequests().subscribe(
            (trips: any[]) => {
                this.allTrips = trips;
                this.applyFilters();
            }
        );
        this.subscriptions.push(sub);
    }

    applyFilters(): void {
        this.filteredTrips = this.allTrips.filter(trip => {
            const tripStatus = trip.requestStatusTrip || trip.requestStatus;
            let statusMatch = this.filterStatus === 'all';

            if (!statusMatch) {
                if (this.filterStatus === 'pending') {
                    statusMatch = tripStatus === 'requested';
                } else if (this.filterStatus === 'accepted') {
                    statusMatch = tripStatus === 'acceptedByDriver' || tripStatus === 'driverIsInSitu';
                } else if (this.filterStatus === 'in_progress') {
                    statusMatch = tripStatus === 'inTravel';
                } else if (this.filterStatus === 'finished') {
                    statusMatch = tripStatus === 'finished' || tripStatus === 'Finalizada';
                } else if (this.filterStatus === 'cancelled') {
                    statusMatch = tripStatus === 'cancelledByUser' || tripStatus === 'cancelledByDriver' || tripStatus === 'Cancelada';
                } else {
                    statusMatch = tripStatus === this.filterStatus;
                }
            }

            let dateMatch = true;
            if (this.filterDateStart || this.filterDateEnd) {
                let tripDate: Date;
                if (trip.requestFullDate && trip.requestFullDate.toDate) {
                    tripDate = trip.requestFullDate.toDate();
                } else if (trip.requestRegisterDate) {
                    tripDate = new Date(trip.requestRegisterDate);
                } else {
                    return false;
                }

                const start = this.filterDateStart ? new Date(this.filterDateStart + 'T00:00:00') : null;
                const end = this.filterDateEnd ? new Date(this.filterDateEnd + 'T23:59:59') : null;

                if (start && tripDate < start) dateMatch = false;
                if (end && tripDate > end) dateMatch = false;
            }

            return statusMatch && dateMatch;
        });

        this.filteredTrips.sort((a, b) => {
            const dateA = a.requestFullDate?.toDate ? a.requestFullDate.toDate() : new Date(a.requestRegisterDate);
            const dateB = b.requestFullDate?.toDate ? b.requestFullDate.toDate() : new Date(b.requestRegisterDate);
            return dateB.getTime() - dateA.getTime();
        });

        this.calculateStats();
    }

    calculateStats(): void {
        this.stats = {
            totalTrips: this.filteredTrips.length,
            platformEarnings: 0,
            driverEarnings: 0,
            cancellationRate: 0,
            finishedTrips: 0,
            cancelledTrips: 0
        };

        this.filteredTrips.forEach(trip => {
            const tripStatus = trip.requestStatusTrip || trip.requestStatus;
            if (tripStatus === 'finished' || tripStatus === 'Finalizada') {
                this.stats.finishedTrips++;
                this.stats.platformEarnings += Number(trip.requestCommission || 0);
                this.stats.driverEarnings += Number(trip.requestDriverEarnings || 0);
            } else if (tripStatus === 'cancelledByUser' || tripStatus === 'cancelledByDriver' || tripStatus === 'Cancelada') {
                this.stats.cancelledTrips++;
            }
        });

        if (this.stats.totalTrips > 0) {
            this.stats.cancellationRate = (this.stats.cancelledTrips / this.stats.totalTrips) * 100;
        }
    }

    formatDate(date: Date): string {
        const d = new Date(date);
        let month = '' + (d.getMonth() + 1);
        let day = '' + d.getDate();
        const year = d.getFullYear();

        if (month.length < 2) month = '0' + month;
        if (day.length < 2) day = '0' + day;

        return [year, month, day].join('-');
    }

    getStatusLabel(status: string): string {
        const statusMap: any = {
            'requested': 'Solicitado',
            'acceptedByDriver': 'Aceptado por Conductor',
            'driverIsInSitu': 'Conductor en Lugar',
            'inTravel': 'En Viaje',
            'finished': 'Finalizado',
            'cancelledByUser': 'Cancelado por Usuario',
            'cancelledByDriver': 'Cancelado por Conductor',
            'Finalizada': 'Finalizado',
            'Cancelada': 'Cancelado'
        };
        return statusMap[status] || status;
    }

    viewTripDetail(trip: any): void {
        // Navegar a la página de detalle del viaje
        this.router.navigate(['/admin-panel/admin-trip-detail', trip.requestId]);
    }

    openDocumentLightbox(imageUrl: string): void {
        this.lightboxImage = imageUrl;
        $('#documentLightbox').modal('show');
    }

    clearDates(): void {
        this.filterDateStart = '';
        this.filterDateEnd = '';
        this.loadTrips();
    }
}
