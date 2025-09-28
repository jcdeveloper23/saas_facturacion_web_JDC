import { Component, OnInit } from '@angular/core';
import { Representative } from 'app/interfaces/representative';
import { Users } from 'app/interfaces/users';
import { RepresentativeService } from 'app/services/representative/representative.service';
import { Papa } from 'ngx-papaparse';

@Component({
  selector: 'app-imports-representatives',
  templateUrl: './imports-representatives.component.html',
  styleUrls: ['./imports-representatives.component.css']
})
export class ImportsRepresentativesComponent implements OnInit {
  public name_file: string = '';
  public isUploadFile: boolean = false;
  public infoUser: Users;
  public arrayRepresentatives: Representative[] = [];
  public arrayEmailsRepresentatives: String[] = [];
  constructor(
    private papa: Papa,
    private representativeService: RepresentativeService,
  ) { }

  ngOnInit(): void {
    this.infoUser = JSON.parse(localStorage.getItem("infoUser"));
  }


  /**
 * Metodo para setear los datos del csv cargado.
 */
  public handleFileSelect(evt) {
    this.name_file = evt.target.files[0].name;
    this.isUploadFile = true;
    var files = evt.target.files; // FileList object
    var file = files[0];
    var reader = new FileReader();
    reader.readAsText(file);
    reader.onload = (event: any) => {
      var csv = event.target.result; // Content of CSV file
      this.papa.parse(csv, {
        skipEmptyLines: true,
        header: true,
        complete: (results) => {
          var cont = 0;
          results.data.forEach((representative: Representative) => {
            if (
              representative.representative_email != '' 
              && representative.representative_identification != ''
              && representative.representative_identification != 'Est. Unitec') {
              representative.representative_id = (new Date().getTime() + cont).toString();
              representative.representative_state = false;
              representative.representative_name = representative.representative_name.toUpperCase().trim();
              representative.representative_surname = representative.representative_surname.toUpperCase().trim();
              representative.representative_email = representative.representative_email.trim();
              representative.representative_state_confirm = false;
              representative.representative_state_confirm_by_bar = true;
              
              if (representative.representative_identification.length <= 9) {
                representative.representative_identification = '0'+representative.representative_identification;
              }
              if (this.arrayEmailsRepresentatives.includes(representative.representative_email)) {
              } else {
                this.arrayEmailsRepresentatives.push(representative.representative_email);
                this.arrayRepresentatives.push(representative);
              }
            }
            cont++;
          });
        }
      });
    }
  };


  save () {
    this.arrayRepresentatives.forEach(representative => {
      this.representativeService.saveRepresentativeImport(representative);
    });
  }


  /**
    * Metodo para simular click en input type file.
    */
  public clickUploadFile() {
    document.getElementById('upload_file').click();

  }

}
