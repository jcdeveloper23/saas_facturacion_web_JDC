import { Component, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { RequestVehicleService } from '../../../services/request-vehicle/request-vehicle.service';
import { Subscription } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { Chart } from 'chart.js';

declare var $: any;

@Component({
    selector: 'app-admin-trips-stats',
    templateUrl: './admin-trips-stats.component.html',
    styleUrls: ['./admin-trips-stats.component.css']
})
export class AdminTripsStatsComponent implements OnInit, AfterViewInit, OnDestroy {

    public trips: any[] = [];
    public stats = {
        totalTrips: 0,
        platformEarnings: 0,
        driverEarnings: 0,
        cancellationRate: 0,
        activeTrips: 0,
        finishedTrips: 0,
        cancelledTrips: 0
    };

    public loading: boolean = true;
    private subscriptions: Subscription[] = [];

    // Filtros (recibidos por queryParams o por defecto)
    public filterStatus: string = 'all';
    public filterDateStart: string = '';
    public filterDateEnd: string = '';

    // Gráficas
    private statusChart: any;
    private dailyChart: any;
    private earningsChart: any;

    constructor(
        private requestVehicleService: RequestVehicleService,
        private route: ActivatedRoute,
        private router: Router
    ) { }

    ngOnInit(): void {
        this.route.queryParams.subscribe(params => {
            this.filterStatus = params['status'] || 'all';
            this.filterDateStart = params['start'] || '';
            this.filterDateEnd = params['end'] || '';
            this.loadTrips();
        });
    }

    ngAfterViewInit(): void {
        this.initTooltips();
    }

    ngOnDestroy(): void {
        this.subscriptions.forEach(sub => sub.unsubscribe());
        if (this.statusChart) this.statusChart.destroy();
        if (this.dailyChart) this.dailyChart.destroy();
        if (this.earningsChart) this.earningsChart.destroy();
    }

    loadTrips(): void {
        this.loading = true;
        const start = this.filterDateStart ? new Date(this.filterDateStart) : null;
        const end = this.filterDateEnd ? new Date(this.filterDateEnd) : null;

        // Si hay fecha final, ponerla al final del día
        if (end) end.setHours(23, 59, 59, 999);

        const sub = this.requestVehicleService.getFilteredRequests(['requested', 'acceptedByDriver', 'driverIsInSitu', 'inTravel', 'finished', 'cancelledByUser', 'cancelledByDriver'], start, end).subscribe(
            (trips: any[]) => {
                this.trips = trips;
                this.processData();
                this.loading = false;
                setTimeout(() => {
                    this.initCharts();
                    this.initTooltips();
                }, 100);
            },
            error => {
                console.error('Error loading trips for stats:', error);
                this.loading = false;
            }
        );
        this.subscriptions.push(sub);
    }

    processData(): void {
        this.stats = {
            totalTrips: this.trips.length,
            platformEarnings: 0,
            driverEarnings: 0,
            cancellationRate: 0,
            activeTrips: 0,
            finishedTrips: 0,
            cancelledTrips: 0
        };

        this.trips.forEach(trip => {
            const status = trip.requestStatusTrip || trip.requestStatus;

            if (status === 'finished' || status === 'Finalizada') {
                this.stats.finishedTrips++;
                this.stats.platformEarnings += Number(trip.requestCommission || 0);
                this.stats.driverEarnings += Number(trip.requestDriverEarnings || 0);
            } else if (status === 'cancelledByUser' || status === 'cancelledByDriver' || status === 'Cancelada') {
                this.stats.cancelledTrips++;
            } else {
                this.stats.activeTrips++;
            }
        });

        if (this.stats.totalTrips > 0) {
            this.stats.cancellationRate = (this.stats.cancelledTrips / this.stats.totalTrips) * 100;
        }
    }

    initCharts(): void {
        this.initStatusChart();
        this.initDailyChart();
        this.initEarningsChart();
    }

    initStatusChart(): void {
        const ctx = document.getElementById('statusChart') as HTMLCanvasElement;
        if (!ctx) return;
        if (this.statusChart) this.statusChart.destroy();

        this.statusChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Finalizados', 'Cancelados', 'Activos'],
                datasets: [{
                    data: [this.stats.finishedTrips, this.stats.cancelledTrips, this.stats.activeTrips],
                    backgroundColor: ['#00f2c3', '#ff6384', '#1d8cf8'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: 'rgba(255, 255, 255, 0.8)', padding: 20 }
                    }
                }
            }
        });
    }

    initDailyChart(): void {
        const ctx = document.getElementById('dailyChart') as HTMLCanvasElement;
        if (!ctx) return;
        if (this.dailyChart) this.dailyChart.destroy();

        const days: any = {};
        this.trips.forEach(trip => {
            const date = trip.requestRegisterDate || (trip.requestFullDate?.toDate() ? this.formatDate(trip.requestFullDate.toDate()) : 'N/A');
            if (date !== 'N/A') {
                days[date] = (days[date] || 0) + 1;
            }
        });

        const labels = Object.keys(days).sort();
        const data = labels.map(l => days[l]);

        this.dailyChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Viajes',
                    data: data,
                    borderColor: '#ff8d72',
                    backgroundColor: 'rgba(255, 141, 114, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#ff8d72'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { color: 'rgba(255, 255, 255, 0.7)' },
                        grid: { color: 'rgba(255, 255, 255, 0.05)' }
                    },
                    x: {
                        ticks: { color: 'rgba(255, 255, 255, 0.7)' },
                        grid: { display: false }
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });
    }

    initEarningsChart(): void {
        const ctx = document.getElementById('earningsChart') as HTMLCanvasElement;
        if (!ctx) return;
        if (this.earningsChart) this.earningsChart.destroy();

        this.earningsChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Plataforma (Comisión)', 'Ganancia Conductores'],
                datasets: [{
                    data: [this.stats.platformEarnings, this.stats.driverEarnings],
                    backgroundColor: ['#00f2c3', '#1d8cf8'],
                    borderRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { color: 'rgba(255, 255, 255, 0.7)' },
                        grid: { color: 'rgba(255, 255, 255, 0.05)' }
                    },
                    x: {
                        ticks: { color: 'rgba(255, 255, 255, 0.7)' },
                        grid: { display: false }
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });
    }

    private formatDate(date: Date): string {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    initTooltips(): void {
        setTimeout(() => {
            if ($ && $('[data-toggle="tooltip"]').tooltip) {
                $('[data-toggle="tooltip"]').tooltip();
            }
        }, 500);
    }

    goBack(): void {
        this.router.navigate(['/admin-panel/admin-trips'], {
            queryParams: {
                status: this.filterStatus,
                start: this.filterDateStart,
                end: this.filterDateEnd
            }
        });
    }
}
