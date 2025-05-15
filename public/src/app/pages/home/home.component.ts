import {Component, OnInit} from '@angular/core';
import {FormGroup, FormControl, Validators, FormBuilder} from '@angular/forms'
import {SchoolService} from '../../services/school/school.service';
import {ProviderService} from '../../services/provider/provider.service';
import {School} from '../../interfaces/school';
import {Provider} from '../../interfaces/provider';
import {take} from 'rxjs/operators';
import {Router} from '@angular/router';
import {LectiveYearService} from '../../services/lective-year/lective-year.service';
import {LectiveYear} from '../../interfaces/lective_year';

declare var $: any;

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit {
  public isLogin = false;
  newRegisterForm: FormGroup;
  schools: School[] = [];
  providersBySchool: Provider[] = [];
  lectiveYears: LectiveYear[] = [];
  selectedSchool: School;
  selectedLective: LectiveYear;
  selectedLectiveName = '--';

  constructor(private formBuilder: FormBuilder,
              private _schoolService: SchoolService,
              private _providerService: ProviderService,
              private _router: Router,
              private _lectiveService: LectiveYearService) {
  }

  ngOnInit(): void {
    this.selectedSchool = {};
    this.selectedLective = {};
    this.getAllSchools().then(() => {
      this.initForm();
    });
    $('#registerModal').appendTo('body');
  }

  private initForm() {
    this.newRegisterForm = this.formBuilder.group({
      school: ['', Validators.required],
      provider: ['', Validators.required],
      lectiveYear: [this.selectedLectiveName, Validators.required],
    });
  }

  public showRegisterModal() {
    $('#registerModal').modal('show');
    $('#registerModal').modal({ backdrop: 'static', keyboard: false });
  }

  public async getAllSchools() {
    this._schoolService.getSchoolsByState().pipe(take(1)).subscribe((school) => {
      this.schools = school;
    })
  }

  public async getAllLectiveYearsFromSchool(school_id) {
    const resp_bdd = await this._lectiveService.getAllLectiveYearFromSchool(school_id).toPromise();
    console.log('*** YEARS ***', resp_bdd);
    
    resp_bdd.docs.forEach((lective) => {
      console.log(lective.data());
      
      this.lectiveYears.push(lective.data());
    });
    this.selectedLective = this.getLectiveYearById();
    this.selectedLectiveName = this.selectedLective.lective_year_name ?? "";
  }

  private getLectiveYearById() {
    for (let i = 0; i < this.lectiveYears.length; i++) {
      if (this.lectiveYears[i].lective_year_id === this.selectedSchool.school_active_lective_year) {
        return this.lectiveYears[i];
      }
    }
  }

  public getProviderBySchool(school_id) {
    this.selectedSchool = this.getSchoolById(school_id);
    this._providerService.getProvidersByUE(school_id).pipe(take(1)).subscribe((provider) => {
      this.providersBySchool = provider;
    })
  }

  private getSchoolById(school_id) {
    for (let i = 0; i < this.schools.length; i++) {
      if (this.schools[i].school_id === school_id) {
        return this.schools[i];
      }
    }
  }

  get f() {
    return this.newRegisterForm.controls;
  }

  onSubmit() {
    if (this.newRegisterForm.invalid) {
      return;
    }

    console.log(this.newRegisterForm.value)

    localStorage.setItem('lectiveYear', this.selectedLective.lective_year_id);

    $('#registerModal').modal('hide');
    setTimeout(() => {
      this.navigateToRegisterRepresentative();
    }, 500);
  }

  navigateToRegisterRepresentative() {
    this._router.navigateByUrl('/register/' + this.newRegisterForm.value.school);
  }

  public closeModal() {
    this.isLogin = false;
  }

}
