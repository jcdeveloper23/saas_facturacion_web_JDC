import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { BcvExchangeRateService } from 'app/services/bcv_exchange_rate/bcv-exchange-rate.service';
import { environment } from 'environments/environment';

@Component({
  selector: 'app-bcv-exchange-rate',
  templateUrl: './bcv-exchange-rate.component.html',
  styleUrls: ['./bcv-exchange-rate.component.css'],
})
export class BcvExchangeRateComponent implements OnInit {

  public bcvRateSelected: BcvRate = {
    current: {
      usd: 0,
      eur: 0,
      date: 'yyyy/mm/dd',
    },
    updates: 0,
  };

  constructor(
    private http: HttpClient,
    public bcvRateService: BcvExchangeRateService
  ) { }

  ngOnInit(): void {
    this.getBcvRate();
  }

  public getBcvRate() {
    this.bcvRateService.getBcvRate().subscribe(bcvRate => {
      console.log(JSON.stringify(bcvRate, null, 3));
      this.bcvRateSelected = bcvRate[0];
    });
  }

  public updateBcvRate() {
    var headers = {};
    var url = `${environment.dolarvzla}`;
    var response = this.http.get<any>(url).subscribe((response) => {
      console.log(JSON.stringify(response, null, 3));
      response.updates = this.bcvRateSelected.updates+1;
      console.log(JSON.stringify(response, null, 3));

      this.saveBcvRate(response);
    });
  }

  public saveBcvRate(bcvRate: BcvRate) {
    this.bcvRateService.saveBcvRate(bcvRate).then(() => {

      // this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Categoría creada correctamente', 'success');
    }).catch((e) => {
      console.log(JSON.stringify(e, null, 3));
    });
  }
}
