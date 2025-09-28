import { Component, OnInit, ViewChild } from '@angular/core';
import { NgForm } from '@angular/forms';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { InstructionsService } from 'app/services/instructions/instructions.service';
import { LoadingService } from 'app/services/loading/loading.service';
import { UtilsService } from 'app/services/utils/utils.service';
declare var $: any;

@Component({
  selector: 'app-register-process',
  templateUrl: './register-process.component.html',
  styleUrls: ['./register-process.component.css']
})

export class RegisterProcessComponent implements OnInit {
  public arrayInstruction: Array<Instructions> = [];

  /// *** Usado para datatables ***
  public dataSource: MatTableDataSource<Instructions>;
  @ViewChild(MatSort) sort: MatSort;
  @ViewChild("tableProviders") paginator: MatPaginator;
  public displayedColumns: string[] = [
    "code",
    "name",
    "phone",
    "status",
    "edit",
    "delete",
  ];
  /// *** #Usado para datatables ***


  public isEdit: boolean = false;
  public instructions: Instructions = {};

  dropdownList = [];
  selectedItems = [];


  constructor(
    public utilsService: UtilsService,
    public instructionService: InstructionsService,
    public loadingService: LoadingService,
  ) { }

  ngOnInit(): void {
    this.loadingService.show('Cargando');
    this.getInstructions();
  }

  public getInstructions() {
    this.instructionService.getInstructions().subscribe(instructions => {
      this.arrayInstruction = instructions;
      console.log(JSON.stringify(this.arrayInstruction, null, 3));
      if (instructions && instructions.length > 0) {
        this.arrayInstruction = instructions;
        this.dataSource = new MatTableDataSource<Instructions>(instructions);
        this.dataSource.paginator = this.paginator;
        this.dataSource.sort = this.sort;
        this.loadingService.hide();
      } else {
        this.arrayInstruction = []
        this.dataSource = new MatTableDataSource<Instructions>(this.arrayInstruction);
        this.dataSource.paginator = this.paginator;
        this.dataSource.sort = this.sort;
        this.loadingService.hide();
      }
    });
  }

  public newInstructions() {
    this.instructions = {}
    this.isEdit = false;
    this.instructions.instructionsId = new Date().getTime().toString();
    this.instructions.instructionsState = true;
    $('#modalNewInstructions').modal('show');
  }


  public async saveInstructions(isValid: boolean, form: NgForm) {
    if (isValid) {
      if (this.isEdit) {

        this.instructionService.editInstructions(this.instructions).then(() => {


          this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Data editada correctamente', 'success');
          $('#modalNewInstructions').modal('hide');
        })
      } else {
        this.instructionService.saveInstructions(this.instructions).then(() => {


          this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Data procesada correctamente', 'success');
          form.resetForm();
          $('#modalNewInstructions').modal('hide');
        }).catch((e) => {
          console.log(JSON.stringify(e, null, 3));
        });
      }
    } else {
    }
  }

  editInstructions(instructions: Instructions) {
    this.isEdit = true;
    this.instructions = instructions;
    $('#modalNewInstructions').modal('show');
  }

  importInstructions() {
    $('#modalImport').modal('show');
  }

  public cancelViewForm(form: NgForm) {
    form.resetForm();
    $('#modalNewInstructions').modal('hide');
  }

  deleteInstructions(instructions: Instructions) {
    this.instructionService.deleteInstructions(instructions.instructionsId).then(() => {
      this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Data eliminada correctamente', 'success');
    });
  }

}
