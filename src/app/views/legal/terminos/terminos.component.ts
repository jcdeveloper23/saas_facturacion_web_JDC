import { Component, ViewEncapsulation } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-terminos',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './terminos.component.html',
  styleUrls: ['./terminos.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class TerminosComponent {}
