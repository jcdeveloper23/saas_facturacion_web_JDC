import { Component, ViewEncapsulation } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-aviso',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './aviso.component.html',
  styleUrls: ['./aviso.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class AvisoComponent {}
