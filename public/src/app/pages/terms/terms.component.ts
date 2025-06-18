import { Component, OnInit } from '@angular/core';
import { CountriesService } from 'app/services/countries/countries.service';
import { DomainService } from 'app/services/domainService/domain.service';

@Component({
  selector: 'app-terms',
  templateUrl: './terms.component.html',
  styleUrls: ['./terms.component.css']
})
export class TermsComponent implements OnInit {

   public country: string;
  public countrySelected: Country = {};

  constructor(
    public domainService: DomainService,
    public countriesService: CountriesService,
  ) { }

  ngOnInit(): void {
    

    this.country = this.domainService.getCountry();
    if (this.country) {
      this.getCountry(this.country);
    }
  }

  public async getCountry(country: string) {
    this.countriesService.getCountry(country).subscribe(async country => {
      if (country.length > 0) {
        this.countrySelected = country[0];
      }
    });
  }

}
